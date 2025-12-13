
"use client";

import type { Order, OrderStatus } from "@/types";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "./ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrders } from "@/contexts/order-provider";

interface OrderCardProps {
  order: Order;
  role: 'student' | 'staff';
}

export function OrderCard({ order, role }: OrderCardProps) {
  const { updateOrderStatus } = useOrders();
  
  const couponId = order.studentId.split('-')[1] || order.id;

  const handleStatusUpdate = () => {
      updateOrderStatus(order.id, 'Completed');
  };

  return (
    <Card 
      className={cn(
        "flex flex-col w-full relative transition-all duration-300 ease-in-out",
        {
          "overflow-hidden border-0 shadow-md hover:shadow-lg hover:-translate-y-1": role === 'student',
          "flex-row items-center p-0": role === 'staff',
        }
      )}
    >
      <CardContent className={cn("flex-grow flex flex-col justify-center items-center text-center", {
        "p-0": role === 'student',
        "p-0 flex-shrink-0": role === 'staff'
      })}>
        <div className={cn(
            "rounded-lg p-2 w-full font-bold tracking-wider transition-colors duration-300",
            role === 'student' ? 'text-4xl sm:text-5xl md:text-6xl p-3 md:p-4' : 'text-base px-1.5 py-1',
            {
              'bg-blue-200/90 dark:bg-blue-900/50 text-blue-900 dark:text-blue-200': order.status === 'Preparing',
              'bg-green-200/90 dark:bg-green-900/50 text-green-900 dark:text-green-200': order.status === 'Ready',
            }
          )}>
            <p className="font-mono tabular-nums">{couponId}</p>
        </div>
      </CardContent>
      {role === 'staff' && (
        <CardFooter className="p-0 pl-1 pr-2 flex-grow">
          <Button onClick={handleStatusUpdate} size="sm" className="bg-primary hover:bg-primary/90 transition-colors font-semibold h-8 text-xs hover:scale-105 transform duration-200 ease-in-out px-2 py-1">
            <Check className="mr-1 h-3 w-3" />
            <span>Collected</span>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
