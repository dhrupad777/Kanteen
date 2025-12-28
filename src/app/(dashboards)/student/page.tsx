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

  const readyOrders = orders.filter(o => o.status === 'Ready');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-10rem)]">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6">
        <div>
          <h1 className="font-headline text-3xl font-bold text-primary">
            {user ? `Hello, ${userProfile?.name?.split(' ')[0] || user?.displayName?.split(' ')[0] || 'Student'}` : 'Hello'}
          </h1>
          <p className="text-muted-foreground mt-1 font-medium">Canteen Order Number Status</p>
        </div>


      </div>


      <MenuDisplay />

      <Button asChild className="w-full bg-[#FF4500] hover:bg-[#CC3700] text-white shadow-sm h-12 text-lg font-medium">
        <Link href="/order" className="flex items-center justify-center gap-2">
          <ShoppingBag className="h-5 w-5" />
          Order Online
        </Link>
      </Button>

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

      {readyOrders.length > 0 && (
        <DashboardSection
          title="Ready to Collect"
          icon={<CupSoda className="w-6 h-6 text-green-800" />}
          orders={readyOrders}
          emptyMessage="No orders are ready for pickup yet."
          className="bg-green-100/60 dark:bg-green-900/30 border-green-300/20 dark:border-green-700/50"
        />
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
        <CardTitle className="font-headline text-xl md:text-2xl font-bold flex items-center gap-3 text-foreground/80">
          {icon}
          <span>{title} ({orders.length})</span>
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
