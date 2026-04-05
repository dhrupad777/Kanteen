
"use client";

import type { ReactNode } from "react";
import React, { createContext, useCallback, useContext, useState, useEffect, useRef } from 'react';
import { Order, OrderStatus } from '@/types';
import { db } from '@/lib/firebase';
import { collection, doc, addDoc, updateDoc, onSnapshot, query, where, serverTimestamp, Timestamp, deleteDoc, limit, runTransaction, getDoc, setDoc } from "firebase/firestore";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { checkManagerAllowlist } from "@/lib/auth";

interface OrderContextType {
  orders: Order[];
  loading: boolean;
  addOrder: (couponId: string) => Promise<void>;
  updateOrderStatus: (orderId: string, newStatus: OrderStatus) => void;
  deleteOrder: (orderId: string) => void;
  updateOrderCoupon: (orderId: string, newCouponId: string) => void;
  getOrdersByStudent: (studentId: string) => Order[];
  getOrdersByStatus: (status: OrderStatus) => Order[];
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export const MANAGER_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCachedManagerRole(email: string): boolean | null {
  try {
    const raw = sessionStorage.getItem(`mgr:${email}`);
    if (!raw) return null;
    const { value, expiry } = JSON.parse(raw);
    if (Date.now() > expiry) {
      sessionStorage.removeItem(`mgr:${email}`);
      return null;
    }
    return value as boolean;
  } catch {
    return null;
  }
}

function setCachedManagerRole(email: string, value: boolean) {
  try {
    sessionStorage.setItem(`mgr:${email}`, JSON.stringify({ value, expiry: Date.now() + MANAGER_CACHE_TTL }));
  } catch {
    // sessionStorage unavailable (private browsing edge cases)
  }
}

export const OrderProvider = ({ children }: { children: ReactNode }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const [isManager, setIsManager] = useState<boolean | null>(null);
  const [isVerifiedManager, setIsVerifiedManager] = useState<boolean>(false);

  // Check for manager role whenever auth state changes
  // Uses sessionStorage cache (10 min TTL) to avoid blocking order listeners on every page load
  useEffect(() => {
    async function checkRole() {
      try {
        if (user?.email) {
          // Check cache first — avoids extra Firestore round-trip on every visit
          const cached = getCachedManagerRole(user.email);
          if (cached !== null) {
            setIsVerifiedManager(cached);
            setIsManager(cached);
            return;
          }
          const allowed = await checkManagerAllowlist(user.email);
          setCachedManagerRole(user.email, allowed);
          setIsVerifiedManager(allowed);
          setIsManager(allowed);
        } else {
          setIsVerifiedManager(false);
          setIsManager(false);
        }
      } catch (err) {
        console.error("checkRole failed, defaulting to student path:", err);
        setIsVerifiedManager(false);
        setIsManager(false);
      }
    }
    if (!authLoading) checkRole();
  }, [user, authLoading]);

  // Fetch public orders via API (for unauthenticated users)
  const fetchPublicOrders = useCallback(async () => {
    try {
      const response = await fetch('/api/orders/public');
      if (!response.ok) throw new Error('Failed to fetch public orders');
      const data = await response.json();
      const fetchedOrders: Order[] = data.orders.map((o: any) => ({
        ...o,
        createdAt: o.createdAt ? new Date(o.createdAt) : new Date(0),
      }));
      fetchedOrders.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      setOrders(fetchedOrders);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching public orders:', error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || isManager === null) return;
    setLoading(true);

    const listeners: (() => void)[] = [];
    const ordersMap = new Map<string, Order>();
    const MAX_ORDERS_IN_MEMORY = 1000; // Prevent unbounded memory growth

    const updateOrdersFromSnapshot = (snapshot: any) => {
      snapshot.docChanges().forEach((change: any) => {
        const doc = change.doc;
        if (change.type === 'removed') {
          ordersMap.delete(doc.id);
        } else {
          // Prevent unbounded growth - skip new orders if at limit
          if (ordersMap.size >= MAX_ORDERS_IN_MEMORY && !ordersMap.has(doc.id)) {
            console.warn('OrderProvider: Max orders limit reached, skipping new order');
            return;
          }
          const data = doc.data();
          ordersMap.set(doc.id, {
            id: doc.id,
            studentId: data.studentId,
            items: data.items,
            status: data.status,
            token: data.token,
            otpHash: data.otpHash,
            // Only expose the plaintext OTP to the order's owner.
            // Firestore rules allow any auth'd user to read Preparing/Ready orders
            // (for the public board), but secretOtp must never be shown for other users' orders.
            secretOtp: data.studentId === user?.uid ? data.secretOtp : undefined,
            totalPrice: data.totalPrice,
            isParcel: data.isParcel,
            platformCharges: data.platformCharges,
            note: data.note,
            createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : new Date(),
            dateKey: data.dateKey,
            kitchen: data.kitchen,
            userEmail: data.userEmail,
            userName: data.userName,
          });
        }
      });

      const newOrders = Array.from(ordersMap.values());
      newOrders.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      setOrders(newOrders);
      setLoading(false);
    };

    if (isVerifiedManager) {
      // 1. MANAGER: All active orders
      const q = query(
        collection(db, "orders"),
        where("status", "in", ["PAID", "Preparing", "Ready"]),
        limit(500)
      );
      listeners.push(onSnapshot(q, updateOrdersFromSnapshot, (err) => {
        if (err.code !== 'permission-denied') {
          console.error("Manager listener error:", err);
        }
        setLoading(false); // Ensure loading is set to false even on error
      }));
    } else if (user) {
      // 2. LOGGED IN STUDENT: API polling for public board + private Firestore listener for own orders
      // The public Firestore queries (qReady/qPreparing without owner filter) hit permission-denied
      // for non-managers, so we use the same admin-SDK API endpoint as unauthenticated users.
      const publicMap = new Map<string, Order>();
      const privateMap = new Map<string, Order>();

      const rebuildAndSet = () => {
        const merged = new Map<string, Order>();
        publicMap.forEach((o, id) => merged.set(id, o));
        privateMap.forEach((o, id) => merged.set(id, o));
        const sorted = Array.from(merged.values()).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        setOrders(sorted);
        setLoading(false);
      };

      const fetchAndUpdatePublic = async () => {
        try {
          const response = await fetch('/api/orders/public');
          if (!response.ok) { setLoading(false); return; }
          const data = await response.json();
          publicMap.clear();
          (data.orders as any[]).forEach((o) => {
            publicMap.set(o.id, { ...o, createdAt: o.createdAt ? new Date(o.createdAt) : new Date(0) });
          });
          rebuildAndSet();
        } catch {
          setLoading(false);
        }
      };

      fetchAndUpdatePublic();
      const pollInterval = setInterval(fetchAndUpdatePublic, 5000);
      listeners.push(() => clearInterval(pollInterval));

      // STUDENT PRIVATE: Own active orders (only after payment confirmed)
      const qPrivate = query(
        collection(db, "orders"),
        where("studentId", "==", user.uid),
        where("status", "in", ["Preparing", "Ready"]),
        limit(20)
      );
      listeners.push(onSnapshot(qPrivate, (snapshot) => {
        snapshot.docChanges().forEach((change: any) => {
          if (change.type === 'removed') {
            privateMap.delete(change.doc.id);
          } else {
            const d = change.doc.data();
            privateMap.set(change.doc.id, {
              id: change.doc.id,
              studentId: d.studentId,
              items: d.items,
              status: d.status,
              token: d.token,
              otpHash: d.otpHash,
              secretOtp: d.secretOtp, // own order — safe to expose
              totalPrice: d.totalPrice,
              isParcel: d.isParcel,
              platformCharges: d.platformCharges,
              note: d.note,
              createdAt: d.createdAt ? (d.createdAt as Timestamp).toDate() : new Date(),
              dateKey: d.dateKey,
              kitchen: d.kitchen,
              userEmail: d.userEmail,
              userName: d.userName,
            });
          }
        });
        rebuildAndSet();
      }, (err) => {
        if (err.code !== 'permission-denied') {
          console.error("Private listener error:", err);
        }
      }));
    } else {
      // 3. UNAUTHENTICATED USER: Use API endpoint with polling
      // Initial fetch
      fetchPublicOrders();

      // Poll every 5 seconds for updates
      const pollInterval = setInterval(fetchPublicOrders, 5000);
      listeners.push(() => clearInterval(pollInterval));
    }

    return () => listeners.forEach(unsub => unsub());
  }, [user, authLoading, isManager, isVerifiedManager, fetchPublicOrders]);


  const addOrder = useCallback(async (couponId: string) => {
    const normalized = couponId.trim().replace(/^0+/, '') || '0';

    // Client-side duplicate check
    const exists = orders.some(o => o.studentId === `student-${normalized}` && o.status === 'Ready');
    if (exists) {
      toast({
        variant: "destructive",
        title: "Duplicate Order",
        description: `Coupon #${normalized} is already in the queue.`,
      });
      return;
    }

    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Authentication required");

      const response = await fetch('/api/staff/orders/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ couponId: normalized })
      });

      if (!response.ok) throw new Error('Failed to create order');
    } catch (error: any) {
      console.error("Error adding document: ", error);
      throw error;
    }
  }, [orders, user]);

  const deleteOrder = useCallback(async (orderId: string) => {
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Authentication required");

      await fetch(`/api/staff/orders/${orderId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (error) {
      console.error("Error deleting document: ", error);
    }
  }, [user]);

  const updateOrderStatus = useCallback(async (orderId: string, newStatus: OrderStatus) => {
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Authentication required");

      await fetch(`/api/staff/orders/${orderId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  }, [user]);

  const updateOrderCoupon = useCallback(async (orderId: string, newCouponId: string) => {
    const activeOrder = orders.find(o => o.studentId === `student-${newCouponId}` && (o.status === 'Ready'));
    if (activeOrder) {
      toast({
        variant: "destructive",
        title: "Duplicate Order",
        description: `Coupon #${newCouponId} is already in the queue.`,
      })
      return;
    }

    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Authentication required");

      await fetch(`/api/staff/orders/${orderId}/update-coupon`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ newCouponId })
      });
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  }, [orders, user]);


  const getOrdersByStudent = useCallback((studentId: string) => {
    return orders.filter(order => order.studentId === studentId);
  }, [orders]);

  const getOrdersByStatus = useCallback((status: OrderStatus) => {
    return orders.filter(order => order.status === status);
  }, [orders]);

  const value = {
    orders,
    loading,
    addOrder,
    updateOrderStatus,
    deleteOrder,
    updateOrderCoupon,
    getOrdersByStudent,
    getOrdersByStatus,
  };

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
};

export const useOrders = (): OrderContextType => {
  const context = useContext(OrderContext);
  if (context === undefined) {
    throw new Error('useOrders must be used within an OrderProvider');
  }
  return context;
};
