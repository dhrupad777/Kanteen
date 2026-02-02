
"use client";

import type { ReactNode } from "react";
import React, { createContext, useCallback, useContext, useState, useEffect, useRef } from 'react';
import { Order, OrderStatus } from '@/types';
import { db } from '@/lib/firebase';
import { collection, doc, addDoc, updateDoc, onSnapshot, query, where, serverTimestamp, Timestamp, deleteDoc, limit, orderBy, runTransaction, getDoc, setDoc } from "firebase/firestore";
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

export const OrderProvider = ({ children }: { children: ReactNode }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const { user, loading: authLoading } = useAuth();
  const [isManager, setIsManager] = useState<boolean | null>(null);
  const [isVerifiedManager, setIsVerifiedManager] = useState<boolean>(false);

  // Check for manager role whenever auth state changes
  useEffect(() => {
    async function checkRole() {
      if (user?.email) {
        const allowed = await checkManagerAllowlist(user.email);
        setIsVerifiedManager(allowed);
        setIsManager(allowed);
      } else {
        setIsVerifiedManager(false);
        setIsManager(false);
      }
    }
    if (!authLoading) checkRole();
  }, [user, authLoading]);

  useEffect(() => {
    if (authLoading || isManager === null) return;

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
            secretOtp: data.secretOtp, // OTP for display when order is Ready
            totalPrice: data.totalPrice,
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
    } else {
      // 2. STUDENT/PUBLIC: All Ready orders (filtered client-side for offline coupons)
      // Note: Fetches all Ready orders to avoid composite index requirement on (status, token)
      const qPublic = query(
        collection(db, "orders"),
        where("status", "==", "Ready"),
        limit(200)
      );
      listeners.push(onSnapshot(qPublic, updateOrdersFromSnapshot, (err) => {
        if (err.code !== 'permission-denied') {
          console.error("Public listener error:", err);
        }
        setLoading(false); // Ensure loading is set to false even on error
      }));

      // 3. STUDENT PRIVATE: Own active orders (only after payment confirmed)
      if (user) {
        const qPrivate = query(
          collection(db, "orders"),
          where("studentId", "==", user.uid),
          where("status", "in", ["Preparing", "Ready"]),
          limit(20)
        );
        listeners.push(onSnapshot(qPrivate, updateOrdersFromSnapshot, (err) => {
          if (err.code !== 'permission-denied') {
            console.error("Private listener error:", err);
          }
          setLoading(false); // Ensure loading is set to false even on error
        }));
      }
    }

    return () => listeners.forEach(unsub => unsub());
  }, [user, authLoading, isManager, isVerifiedManager]);


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
