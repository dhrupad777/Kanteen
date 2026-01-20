"use client";

export const dynamic = "force-dynamic";


import { useEffect, useState } from 'react';
import { useOrders } from '@/contexts/order-provider';
import { Order } from '@/types';
import { CouponEntryForm } from '@/components/coupon-entry-form';
import { checkManagerAllowlist } from '@/lib/auth';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldX, Utensils } from 'lucide-react';
import { CouponGrid } from '@/components/coupon-grid';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { MenuManager } from '@/components/menu-manager';

export default function StaffDashboardPage() {
  console.log("Rendering Staff Dashboard");
  const { orders, loading: ordersLoading } = useOrders();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    async function verifyManager() {
      if (user && user.email) {
        const allowed = await checkManagerAllowlist(user.email);
        setIsAuthorized(allowed);
      } else if (!authLoading) {
        setIsAuthorized(false);
      }
    }
    verifyManager();
  }, [user, authLoading]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const isLoading = authLoading || ordersLoading || isAuthorized === null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-10rem)]">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  // Check if user is a manager using allowlist
  if (isAuthorized === false) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-10rem)]">
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <ShieldX className="h-6 w-6" />
              <CardTitle>Access Denied</CardTitle>
            </div>
            <CardDescription>
              You don't have permission to access the Manager Dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Only authorized managers can access this page. If you believe this is an error,
              please contact your administrator.
            </p>
            <Link href="/">
              <Button className="w-full">Return to Home</Button>
            </Link>
          </CardContent>
        </Card>
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
        <Link href="/staff/kitchen">
          <Button className="bg-primary hover:bg-primary/90">
            <Utensils className="mr-2 h-4 w-4" />
            Kitchen View
          </Button>
        </Link>
      </div>
      <div className="space-y-8 pt-4">
        <MenuManager />
        <CouponEntryForm />
        <CouponGrid orders={orders} />
      </div>
    </div>
  );
}
