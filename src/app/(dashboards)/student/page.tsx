"use client";

import { useEffect } from 'react';
import { useOrders } from '@/contexts/order-provider';
import { OrderCard } from '@/components/order-card';
import { Order } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CupSoda, Loader2, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MenuDisplay } from '@/components/menu-display';

export default function StudentDashboardPage() {
  const { orders, loading: ordersLoading } = useOrders();
  const { user, userProfile, loading: authLoading } = useAuth();
  const router = useRouter();

  // Auth check removed - dashboard is public


  const loading = ordersLoading || authLoading;

  const myActiveOrders = orders.filter(o =>
    o.studentId === user?.uid &&
    ['Preparing', 'Ready'].includes(o.status)
  );
  const publicReadyOrders = orders.filter(o => o.status === 'Ready' && (!o.token || o.token < 201) && o.studentId !== user?.uid);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-10rem)]">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-2">
        <div>
          <h1 className="font-headline text-3xl font-bold text-primary">
            {user ? `Hello, ${userProfile?.name?.split(' ')[0] || user?.displayName?.split(' ')[0] || 'Student'}` : 'Hello'}
          </h1>
        </div>
      </div>

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

      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="w-full"
      >
        <Link href="/order" className="block w-full">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-400 via-orange-500 to-red-600 p-1 shadow-lg shadow-orange-500/20">
            <div className="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity duration-300" />
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
      </motion.div>

      {publicReadyOrders.length > 0 && (
        <DashboardSection
          title="Ready to Collect"
          icon={<CupSoda className="w-6 h-6 text-green-800" />}
          orders={publicReadyOrders}
          emptyMessage=""
          className="bg-green-50 border-green-100"
        />
      )}

      {orders.length === 0 && !loading && (
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
            <span className="text-[10px] font-medium text-muted-foreground italic normal-case flex items-center gap-1">
              Tap for summary
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {orders.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
            <AnimatePresence>
              {orders.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(order => {
                return (
                  <motion.div
                    key={order.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="relative group"
                  >
                    <OrderCard
                      order={order}
                      role="student"
                    />
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        ) : (
          <p className="text-muted-foreground p-4 text-center">{emptyMessage}</p>
        )}
      </CardContent>
    </Card>
  )
}
