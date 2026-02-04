"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Order card skeleton
export function OrderCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <Skeleton className="h-8 w-16 rounded-lg" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-4 w-24 mt-2" />
    </div>
  );
}

// Dashboard section skeleton (for My Orders, Ready to Collect)
export function DashboardSectionSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("border shadow-sm", className)}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-6 rounded" />
          <Skeleton className="h-6 w-32" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Menu display skeleton
export function MenuDisplaySkeleton() {
  return (
    <div className="w-full max-w-lg mx-auto space-y-2">
      {/* Main Course */}
      <div className="bg-white border border-orange-100 rounded-xl p-3 shadow-sm">
        <Skeleton className="h-3 w-20 mb-2" />
        <div className="flex justify-between gap-2">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 flex-1" />
        </div>
      </div>
      {/* Breakfast & Snacks */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white border border-orange-100 rounded-xl p-3 shadow-sm">
          <Skeleton className="h-3 w-16 mb-2" />
          <div className="grid grid-cols-2 gap-1">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
        <div className="bg-white border border-orange-100 rounded-xl p-3 shadow-sm">
          <Skeleton className="h-3 w-12 mb-2" />
          <div className="grid grid-cols-2 gap-1">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Order online button skeleton
export function OrderButtonSkeleton() {
  return (
    <Skeleton className="w-full h-16 rounded-2xl" />
  );
}

// Full student dashboard skeleton
export function StudentDashboardSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-2">
        <div>
          <Skeleton className="h-9 w-48" />
        </div>
      </div>

      {/* My Orders Section */}
      <DashboardSectionSkeleton className="bg-orange-50 border-orange-100" />

      {/* Menu Display */}
      <MenuDisplaySkeleton />

      {/* Order Button */}
      <OrderButtonSkeleton />

      {/* Ready to Collect Section */}
      <DashboardSectionSkeleton className="bg-green-50 border-green-100" />
    </div>
  );
}

// Category card skeleton for order page
export function CategoryCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <div className="flex-1">
          <Skeleton className="h-5 w-24 mb-1" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  );
}

// Order page skeleton
export function OrderPageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 pb-28 md:pb-6">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-6 w-24" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-16 hidden sm:block" />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="flex gap-4 md:gap-8">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Search */}
            <Skeleton className="h-10 sm:h-12 w-full rounded-xl sm:rounded-2xl mb-4 sm:mb-6" />

            {/* Category Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <CategoryCardSkeleton key={i} />
              ))}
            </div>
          </div>

          {/* Cart Panel (Desktop) */}
          <div className="hidden md:block w-80 shrink-0">
            <div className="sticky top-24">
              <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <Skeleton className="h-6 w-24 mb-4" />
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
                <div className="mt-4 pt-4 border-t">
                  <Skeleton className="h-12 w-full rounded-xl" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white border-t border-gray-100 p-4">
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}

// Kitchen view skeleton
export function KitchenViewSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      {/* Orders grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <Skeleton className="h-10 w-16 rounded-lg" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <Skeleton className="h-8 w-full rounded-lg mt-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Staff dashboard skeleton
export function StaffDashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Orders section */}
      <KitchenViewSkeleton />
    </div>
  );
}
