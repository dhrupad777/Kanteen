"use client";

import { useEffect, useState } from 'react';
import { useOrders } from '@/contexts/order-provider';
import { Order } from '@/types';
import { CouponEntryForm } from '@/components/coupon-entry-form';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { CouponGrid } from '@/components/coupon-grid';

export default function StaffDashboardPage() {
  const { orders, loading: ordersLoading } = useOrders();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const isLoading = authLoading || ordersLoading;

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-10rem)]">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-bold">Manager Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage all active orders via the coupon grid. Add new orders below.
          </p>
        </div>
      </div>
      <div className="space-y-8 pt-4">
        <CouponEntryForm />
        <CouponGrid orders={orders} />
      </div>
    </div>
  );
}
