
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
      const isTestMode = typeof window !== 'undefined' && localStorage.getItem('managerTestMode') === 'true';
      if (user?.email) {
        const allowed = await checkManagerAllowlist(user.email);
        setIsVerifiedManager(allowed);
        setIsManager(allowed || isTestMode);
      } else {
        setIsVerifiedManager(false);
        setIsManager(isTestMode);
      }
    }
    if (!authLoading) checkRole();
  }, [user, authLoading]);

  useEffect(() => {
    if (authLoading || isManager === null) return;

    const listeners: (() => void)[] = [];
    const ordersMap = new Map<string, Order>();

    const updateOrdersFromSnapshot = (snapshot: any) => {
      snapshot.docChanges().forEach((change: any) => {
        const doc = change.doc;
        if (change.type === 'removed') {
          ordersMap.delete(doc.id);
        } else {
          const data = doc.data();
          ordersMap.set(doc.id, {
            id: doc.id,
            studentId: data.studentId,
            items: data.items,
            status: data.status,
            token: data.token,
            otpHash: data.otpHash,
            totalPrice: data.totalPrice,
            createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : new Date(),
            dateKey: data.dateKey,
            kitchen: data.kitchen,
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
      }));
    } else {
      // 2. STUDENT/PUBLIC: Ready offline coupons (Tokens 1-200)
      const qPublic = query(
        collection(db, "orders"),
        where("status", "==", "Ready"),
        where("token", "<", 201),
        limit(200)
      );
      listeners.push(onSnapshot(qPublic, updateOrdersFromSnapshot, (err) => {
        if (err.code !== 'permission-denied') {
          console.error("Public listener error:", err);
        }
      }));

      // 3. STUDENT PRIVATE: Own orders
      if (user) {
        const qPrivate = query(
          collection(db, "orders"),
          where("studentId", "==", user.uid),
          limit(20)
        );
        listeners.push(onSnapshot(qPrivate, updateOrdersFromSnapshot, (err) => {
          if (err.code !== 'permission-denied') {
            console.error("Private listener error:", err);
          }
        }));
      } else {
        setLoading(false);
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

    const docId = `manual-${normalized}-${Date.now()}`;
    const orderRef = doc(db, 'orders', docId);

    try {
      await setDoc(orderRef, {
        studentId: `student-${normalized}`,
        items: [{ name: 'Coupon Meal', quantity: 1, price: 0 }],
        status: 'Ready',
        token: parseInt(normalized),
        createdAt: serverTimestamp(),
        type: 'manual'
      });
    } catch (error: any) {
      console.error("Error adding document: ", error);
      throw error;
    }
  }, [orders]);

  const deleteOrder = useCallback(async (orderId: string) => {
    const orderRef = doc(db, "orders", orderId);
    try {
      await deleteDoc(orderRef);
    } catch (error) {
      console.error("Error deleting document: ", error);
    }
  }, []);

  const updateOrderStatus = useCallback(async (orderId: string, newStatus: OrderStatus) => {
    const orderRef = doc(db, "orders", orderId);
    try {
      await updateDoc(orderRef, {
        status: newStatus
      });

    } catch (error) {
      console.error("Error updating document: ", error);
    }
  }, []);

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

    const orderRef = doc(db, "orders", orderId);
    try {
      await updateDoc(orderRef, {
        studentId: `student-${newCouponId}`,
      });
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  }, [orders]);


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
