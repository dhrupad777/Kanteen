
"use client";
import React, { useState, useMemo, useRef } from 'react';
import { Order } from '@/types';
import { useOrders } from '@/contexts/order-provider';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { EditCouponForm } from './edit-coupon-form';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Loader2 } from 'lucide-react';

const MAX_COUPONS = 200;

interface CouponGridProps {
  orders: Order[];
}

interface CouponButtonProps {
  couponId: number;
  isActive: boolean;
  isLoading: boolean;
  onClick: (id: number) => void;
  onMouseDown: (id: number) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: (id: number) => void;
  onTouchEnd: () => void;
}

// Optimized CouponButton with loading state
const CouponButton = React.memo(({
  couponId,
  isActive,
  isLoading,
  onClick,
  onMouseDown,
  onMouseUp,
  onMouseLeave,
  onTouchStart,
  onTouchEnd
}: CouponButtonProps) => {
  return (
    <Button
      variant={isActive ? 'default' : 'outline'}
      disabled={isLoading}
      className={cn(
        'w-full h-12 text-lg font-bold relative',
        // Use CSS transitions for performance (respects prefers-reduced-motion)
        'transition-all duration-200 ease-out motion-reduce:transition-none',
        isLoading
          ? 'opacity-70 cursor-wait'
          : isActive
            ? 'bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 scale-100'
            : 'bg-card text-card-foreground/70 hover:bg-muted scale-100',
        !isLoading && 'hover:scale-105 active:scale-95'
      )}
      onClick={() => !isLoading && onClick(couponId)}
      onMouseDown={() => !isLoading && onMouseDown(couponId)}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onTouchStart={() => !isLoading && onTouchStart(couponId)}
      onTouchEnd={onTouchEnd}
    >
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        couponId
      )}
    </Button>
  );
}, (prev, next) =>
  prev.isActive === next.isActive &&
  prev.couponId === next.couponId &&
  prev.isLoading === next.isLoading
);

CouponButton.displayName = 'CouponButton';

export function CouponGrid({ orders }: CouponGridProps) {
  const { addOrder, deleteOrder, updateOrderCoupon, updateOrderStatus } = useOrders();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Track loading state for individual coupons
  const [loadingCoupons, setLoadingCoupons] = useState<Set<number>>(new Set());

  const longPressTimer = useRef<NodeJS.Timeout>();

  const activeOrdersMap = useMemo(() => {
    const map = new Map<number, Order>();
    orders.forEach(order => {
      const couponId = parseInt(order.studentId.split('-')[1]);
      if (!isNaN(couponId)) {
        map.set(couponId, order);
      }
    });
    return map;
  }, [orders]);

  // Keep ref to map for stable handlers
  const activeOrdersMapRef = useRef(activeOrdersMap);
  React.useEffect(() => {
    activeOrdersMapRef.current = activeOrdersMap;
  }, [activeOrdersMap]);

  // Helper to set loading state for a coupon
  const setLoading = React.useCallback((couponId: number, loading: boolean) => {
    setLoadingCoupons(prev => {
      const next = new Set(prev);
      if (loading) {
        next.add(couponId);
      } else {
        next.delete(couponId);
      }
      return next;
    });
  }, []);

  // Stable Handlers with loading state
  const handleButtonClick = React.useCallback(async (couponId: number) => {
    const order = activeOrdersMapRef.current.get(couponId);

    // Set loading state immediately for visual feedback
    setLoading(couponId, true);

    try {
      if (order) {
        await updateOrderStatus(order.id, 'PICKED_UP');
      } else {
        await addOrder(couponId.toString());
      }
    } catch (error) {
      console.error('Error processing coupon action:', error);
    } finally {
      // Clear loading state after a short delay to ensure smooth transition
      // The actual state change will come from the Firestore listener
      setTimeout(() => {
        setLoading(couponId, false);
      }, 500);
    }
  }, [addOrder, updateOrderStatus, setLoading]);

  const handleMouseDown = React.useCallback((couponId: number) => {
    const order = activeOrdersMapRef.current.get(couponId);
    if (order) {
      longPressTimer.current = setTimeout(() => {
        setSelectedOrder(order);
        setIsActionMenuOpen(true);
      }, 700);
    }
  }, []);

  const clearLongPressTimer = React.useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  }, []);

  const handleTouchStart = React.useCallback((couponId: number) => handleMouseDown(couponId), [handleMouseDown]);
  const handleTouchEnd = React.useCallback(() => clearLongPressTimer(), [clearLongPressTimer]);


  const handleEdit = () => {
    setIsActionMenuOpen(false);
    setIsEditModalOpen(true);
  };

  const handleDelete = () => {
    setIsActionMenuOpen(false);
    setIsDeleteConfirmOpen(true);
  };

  const handleEditSubmit = async (newCouponId: number) => {
    if (selectedOrder) {
      const oldCouponId = parseInt(selectedOrder.studentId.split('-')[1]);
      setLoading(oldCouponId, true);
      setLoading(newCouponId, true);

      try {
        await updateOrderCoupon(selectedOrder.id, newCouponId.toString());
      } finally {
        setTimeout(() => {
          setLoading(oldCouponId, false);
          setLoading(newCouponId, false);
        }, 500);
      }
    }
    setIsEditModalOpen(false);
    setSelectedOrder(null);
  };

  const handleDeleteConfirm = async () => {
    if (selectedOrder) {
      const couponId = parseInt(selectedOrder.studentId.split('-')[1]);
      setLoading(couponId, true);

      try {
        await deleteOrder(selectedOrder.id);
      } finally {
        setTimeout(() => {
          setLoading(couponId, false);
        }, 500);
      }
    }
    setIsDeleteConfirmOpen(false);
    setSelectedOrder(null);
  };

  // Pre-calculate items rendering logic
  const couponIds = useMemo(() => [...Array(MAX_COUPONS)].map((_, i) => i + 1), []);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="font-headline text-2xl">Coupon Grid</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-15 xl:grid-cols-20 gap-2">
            {couponIds.map((couponId) => {
              const isActive = activeOrdersMap.has(couponId);
              const isLoading = loadingCoupons.has(couponId);
              return (
                <CouponButton
                  key={couponId}
                  couponId={couponId}
                  isActive={isActive}
                  isLoading={isLoading}
                  onClick={handleButtonClick}
                  onMouseDown={handleMouseDown}
                  onMouseUp={clearLongPressTimer}
                  onMouseLeave={clearLongPressTimer}
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Long Press Action Menu */}
      <Dialog open={isActionMenuOpen} onOpenChange={setIsActionMenuOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Actions for Coupon #{selectedOrder?.studentId.split('-')[1]}</DialogTitle>
            <DialogDescription>
              Choose an action for this order. This is for correcting mistakes.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-around pt-4">
            <Button variant="outline" onClick={handleEdit}>Edit Number</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete Order</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      {selectedOrder && (
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Coupon Number</DialogTitle>
              <DialogDescription>Enter the new coupon number for this order.</DialogDescription>
            </DialogHeader>
            <EditCouponForm
              currentCoupon={parseInt(selectedOrder.studentId.split('-')[1] || '0')}
              onSubmit={handleEditSubmit}
              onCancel={() => setIsEditModalOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      {selectedOrder && (
        <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the order for coupon #{selectedOrder.studentId.split('-')[1]}. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm}>Yes, delete it</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

