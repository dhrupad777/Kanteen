"use client";

import { useMemo, useEffect, useState } from 'react';
import { useOrders } from '@/contexts/order-provider';
import { OrderCard } from '@/components/order-card';
import { Order } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CupSoda, ShoppingBag, ChefHat, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import Link from "next/link";
import { MenuDisplay } from '@/components/menu-display';
import { StudentDashboardSkeleton } from '@/components/skeletons';
import { motion, AnimatePresence } from 'framer-motion';

export default function StudentDashboardPage() {
  const { orders, loading: ordersLoading } = useOrders();
  const { user, userProfile, loading: authLoading } = useAuth();

  // Order confirmation toast state
  const [orderConfirmed, setOrderConfirmed] = useState<{ token: number; orderId: string } | null>(null);

  // Auth check removed - dashboard is public

  const loading = ordersLoading || authLoading;

  // Check for order confirmation from payment redirect
  useEffect(() => {
    const data = sessionStorage.getItem('orderConfirmed');
    if (data) {
      try {
        setOrderConfirmed(JSON.parse(data));
        sessionStorage.removeItem('orderConfirmed');
        // Auto-dismiss after 5 seconds
        const timer = setTimeout(() => setOrderConfirmed(null), 5000);
        return () => clearTimeout(timer);
      } catch (e) {
        sessionStorage.removeItem('orderConfirmed');
      }
    }
  }, []);

  // Memoize filtered orders to prevent unnecessary recalculations
  const myActiveOrders = useMemo(() =>
    orders.filter(o =>
      o.studentId === user?.uid &&
      ['Preparing', 'Ready'].includes(o.status)
    ).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    [orders, user?.uid]
  );

  // Offline orders being prepared (coupon grid entries visible to all)
  const publicPreparingOrders = useMemo(() =>
    orders.filter(o =>
      o.status === 'Preparing' &&
      (!o.token || o.token < 201) && // Offline tokens (1-200) or no token
      o.studentId !== user?.uid
    ).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    [orders, user?.uid]
  );

  // Offline orders ready for pickup
  const publicReadyOrders = useMemo(() =>
    orders.filter(o =>
      o.status === 'Ready' &&
      (!o.token || o.token < 201) && // Offline tokens (1-200) or no token
      o.studentId !== user?.uid
    ).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    [orders, user?.uid]
  );

  if (loading) {
    return <StudentDashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Order Confirmed Dialog */}
      <AnimatePresence>
        {orderConfirmed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setOrderConfirmed(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 100, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Auto-dismiss progress bar */}
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 5, ease: "linear" }}
                className="absolute top-0 left-0 right-0 h-1 bg-green-500 origin-left"
              />

              {/* Dismiss button */}
              <button
                onClick={() => setOrderConfirmed(null)}
                className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>

              <div className="p-6 text-center">
                {/* Success icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
                  className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3"
                >
                  <CheckCircle2 className="w-7 h-7 text-green-600" />
                </motion.div>

                <h2 className="text-lg font-bold text-gray-900 mb-1">Order Confirmed!</h2>

                {/* Token number */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.25, type: "spring" }}
                  className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-4 my-3 text-white"
                >
                  <p className="text-orange-100 text-[10px] font-bold uppercase tracking-widest mb-0.5">Your Token</p>
                  <p className="text-5xl font-black tracking-tight">{orderConfirmed.token}</p>
                </motion.div>

                <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mt-2">
                  <ChefHat className="w-4 h-4 text-blue-500" />
                  <span>Being prepared — OTP will appear when ready</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {user && (
        <div className="flex items-center gap-3 border-b pb-4">
          {(userProfile?.photoURL || user.photoURL) && (
            <img
              src={userProfile?.photoURL || user.photoURL || ''}
              alt=""
              referrerPolicy="no-referrer"
              className="h-11 w-11 rounded-full border border-primary/20 object-cover shrink-0"
            />
          )}
          <h1 className="font-headline text-3xl font-bold text-primary">
            Hello, {userProfile?.name?.split(' ')[0] || user.displayName?.split(' ')[0] || ''}
          </h1>
        </div>
      )}

      {myActiveOrders.length > 0 && (
        <DashboardSection
          title="My Orders"
          icon={<ShoppingBag className="w-6 h-6 text-primary" />}
          orders={myActiveOrders}
          emptyMessage=""
          className="bg-orange-50 border-orange-100"
        />
      )}

      <MenuDisplay />

      <Link href="/order" className="block w-full group">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-400 via-orange-500 to-red-600 p-1 shadow-lg shadow-orange-500/20 transition-transform duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]">
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative flex items-center justify-between bg-white/5 backdrop-blur-sm px-6 py-4 rounded-xl border border-white/20">
            <div className="flex flex-col text-left">
              <span className="text-white font-bold text-xl tracking-tight">Order Online</span>
              <span className="text-orange-50 font-medium text-xs opacity-90">Order. Arrive. Eat.</span>
            </div>
            <div className="bg-white/20 p-2.5 rounded-full backdrop-blur-md">
              <ShoppingBag className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
      </Link>

      {publicPreparingOrders.length > 0 && (
        <DashboardSection
          title="Being Prepared"
          icon={<ChefHat className="w-6 h-6 text-blue-600" />}
          orders={publicPreparingOrders}
          emptyMessage=""
          className="bg-blue-50 border-blue-100"
        />
      )}

      {publicReadyOrders.length > 0 && (
        <DashboardSection
          title="Ready to Collect"
          icon={<CupSoda className="w-6 h-6 text-green-800" />}
          orders={publicReadyOrders}
          emptyMessage=""
          className="bg-green-50 border-green-100"
        />
      )}

      {myActiveOrders.length === 0 && publicPreparingOrders.length === 0 && publicReadyOrders.length === 0 && !loading && (
        <Card className="text-center">
          <CardHeader>
            <CardTitle>No Active Orders</CardTitle>
            <CardDescription>The kitchen is quiet right now. No orders are being tracked.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground italic">Don't see your token? Please ask the token distributer to add your order to the queue!</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface DashboardSectionProps {
  title: string;
  icon: React.ReactNode;
  orders: Order[];
  emptyMessage: string;
  className?: string;
}

function DashboardSection({
  title,
  icon,
  orders,
  emptyMessage,
  className,
}: DashboardSectionProps) {
  return (
    <Card className={cn("border shadow-sm", className)}>
      <CardHeader>
        <CardTitle className="font-headline text-xl md:text-2xl font-bold flex items-center justify-between gap-3 text-foreground/80">
          <div className="flex items-center gap-3">
            {icon}
            <span>{title} ({orders.length})</span>
          </div>
          {title === "My Orders" && (
            <span className="text-xs font-medium text-muted-foreground italic normal-case flex items-center gap-1">
              Tap for summary
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {orders.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
            {orders.map((order, index) => (
              <div
                key={order.id}
                className="relative group animate-in fade-in slide-in-from-bottom-2 duration-300"
                style={{ animationDelay: `${Math.min(index * 50, 200)}ms` }}
              >
                <OrderCard
                  order={order}
                  role="student"
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground p-4 text-center">{emptyMessage}</p>
        )}
      </CardContent>
    </Card>
  )
}
