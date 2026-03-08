"use client";

import { useMemo } from 'react';
import { useOrders } from '@/contexts/order-provider';
import { OrderCard } from '@/components/order-card';
import { Order } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CupSoda, ShoppingBag, ChefHat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import Link from "next/link";
import { MenuDisplay } from '@/components/menu-display';
import { StudentDashboardSkeleton } from '@/components/skeletons';

export default function StudentDashboardPage() {
  const { orders, loading: ordersLoading } = useOrders();
  const { user, userProfile, loading: authLoading } = useAuth();

  // Auth check removed - dashboard is public

  const loading = ordersLoading || authLoading;

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
      {user && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-2">
          <div>
            <h1 className="font-headline text-3xl font-bold text-primary">
              Hello, {userProfile?.name?.split(' ')[0] || user?.displayName?.split(' ')[0] || 'Student'}
            </h1>
          </div>
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
