
"use client";
import React, { useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
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

const MAX_COUPONS = 300;

interface CouponGridProps {
  orders: Order[];
}

export function CouponGrid({ orders }: CouponGridProps) {
  const { addOrder, deleteOrder, updateOrderCoupon } = useOrders();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

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

  const handleButtonClick = (couponId: number) => {
    const order = activeOrdersMap.get(couponId);
    if (order) {
      deleteOrder(order.id); // Mark as collected
    } else {
      addOrder(couponId.toString()); // Add new order
    }
  };

  const handleMouseDown = (couponId: number) => {
    const order = activeOrdersMap.get(couponId);
    if (order) {
      longPressTimer.current = setTimeout(() => {
        setSelectedOrder(order);
        setIsActionMenuOpen(true);
      }, 700); // 700ms for long press
    }
  };

  const clearLongPressTimer = () => {
    if(longPressTimer.current) {
        clearTimeout(longPressTimer.current);
    }
  };
  
  const handleTouchStart = (couponId: number) => handleMouseDown(couponId);
  const handleTouchEnd = () => clearLongPressTimer();


  const handleEdit = () => {
    setIsActionMenuOpen(false);
    setIsEditModalOpen(true);
  };

  const handleDelete = () => {
    setIsActionMenuOpen(false);
    setIsDeleteConfirmOpen(true);
  };
  
  const handleEditSubmit = (newCouponId: number) => {
    if (selectedOrder) {
      updateOrderCoupon(selectedOrder.id, newCouponId.toString());
    }
    setIsEditModalOpen(false);
    setSelectedOrder(null);
  };

  const handleDeleteConfirm = () => {
    if (selectedOrder) {
      deleteOrder(selectedOrder.id);
    }
    setIsDeleteConfirmOpen(false);
    setSelectedOrder(null);
  };

  return (
    <>
      <Card>
        <CardHeader>
            <CardTitle className="font-headline text-2xl">Coupon Grid</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="grid grid-cols-5 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-15 xl:grid-cols-20 gap-2">
            {[...Array(MAX_COUPONS)].map((_, i) => {
                const couponId = i + 1;
                const order = activeOrdersMap.get(couponId);
                const isActive = !!order;

                return (
                <motion.div
                    key={couponId}
                    initial={{ scale: 1 }}
                    animate={{ scale: isActive ? [1, 1.1, 1] : 1 }}
                    transition={{ duration: 0.3 }}
                >
                    <Button
                    variant={isActive ? 'default' : 'outline'}
                    className={cn(
                        'w-full h-12 text-lg font-bold transition-all duration-300 ease-in-out transform',
                        isActive ? 'bg-primary text-primary-foreground shadow-lg hover:bg-primary/90' : 'bg-card text-card-foreground/70 hover:bg-muted',
                        'hover:scale-105 active:scale-95'
                    )}
                    onClick={() => {
                        clearLongPressTimer();
                        handleButtonClick(couponId);
                    }}
                    onMouseDown={() => handleMouseDown(couponId)}
                    onMouseUp={clearLongPressTimer}
                    onMouseLeave={clearLongPressTimer}
                    onTouchStart={() => handleTouchStart(couponId)}
                    onTouchEnd={handleTouchEnd}
                    >
                    {couponId}
                    </Button>
                </motion.div>
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
