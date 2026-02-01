
"use client";

import type { Order, OrderStatus } from "@/types";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "./ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrders } from "@/contexts/order-provider";

import { useState } from "react";
import { OrderSummaryDialog } from "./order-summary-dialog";

interface OrderCardProps {
  order: Order;
  role: 'student' | 'staff';
}

export function OrderCard({ order, role }: OrderCardProps) {
  const { updateOrderStatus } = useOrders();
  const [showSummary, setShowSummary] = useState(false);

  const displayId = order.token ? order.token.toString() : (order.studentId.split('-')[1] || order.id);
  const otp = order.secretOtp || (typeof window !== 'undefined' ? localStorage.getItem(`kanteen_otp_${order.id}`) : null);

  const handleStatusUpdate = () => {
    updateOrderStatus(order.id, 'Completed');
  };

  return (
    <>
      <Card
        onClick={() => role === 'student' && setShowSummary(true)}
        className={cn(
          "flex flex-col w-full relative transition-all duration-300 ease-in-out",
          {
            "overflow-hidden border-0 shadow-md hover:shadow-lg hover:-translate-y-1 cursor-pointer": role === 'student',
            "flex-row items-center p-0": role === 'staff',
          }
        )}
      >
        <CardContent className={cn("flex-grow flex flex-col justify-center items-center text-center", {
          "p-0": role === 'student',
          "p-0 flex-shrink-0": role === 'staff'
        })}>
          <div className={cn(
            "rounded-lg p-2 w-full font-bold tracking-wider transition-colors duration-300 flex flex-col items-center justify-center",
            role === 'student' ? 'p-1.5 sm:p-2' : 'text-base px-1.5 py-1',
            {
              'bg-blue-200/90 dark:bg-blue-900/50 text-blue-900 dark:text-blue-200': order.status === 'Preparing',
              'bg-green-200/90 dark:bg-green-900/50 text-green-900 dark:text-green-200': order.status === 'Ready',
            }
          )}>
            <div className="flex flex-col items-center">
              <p className={cn("font-mono tabular-nums leading-none font-black",
                role === 'student' ? 'text-4xl sm:text-5xl md:text-6xl' : 'text-xl'
              )}>{displayId}</p>

              {role === 'staff' && order.userEmail && (
                <p className="text-[10px] leading-tight font-medium opacity-80 mt-0.5 truncate max-w-[80px]">
                  {order.userEmail.split('@')[0]}
                </p>
              )}
            </div>

            {role === 'student' && ['Preparing', 'Ready'].includes(order.status) && order.token && order.token >= 200 && (
              <div className={cn(
                "mt-3 pt-3 w-full animate-in fade-in slide-in-from-top-2 duration-500",
                order.status === 'Ready' ? "border-t border-green-400/30" : "border-t border-blue-400/30"
              )}>
                {otp ? (
                  <>
                    <p className={cn(
                      "text-[10px] uppercase font-bold tracking-[0.2em] mb-1",
                      order.status === 'Ready'
                        ? "text-green-800/60 dark:text-green-200/60"
                        : "text-blue-800/60 dark:text-blue-200/60"
                    )}>Pick-up OTP</p>
                    <p className={cn(
                      "text-2xl md:text-3xl font-mono font-black tracking-[0.1em]",
                      order.status === 'Ready'
                        ? "text-green-900 dark:text-green-100"
                        : "text-blue-900 dark:text-blue-100"
                    )}>{otp}</p>
                  </>
                ) : (
                  <p className={cn(
                    "text-[10px] leading-tight italic font-medium px-2",
                    order.status === 'Ready'
                      ? "text-green-800/70 dark:text-green-200/70"
                      : "text-blue-800/70 dark:text-blue-200/70"
                  )}>Tap to view order details</p>
                )}
              </div>
            )}
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

      <OrderSummaryDialog
        order={order}
        isOpen={showSummary}
        onOpenChange={setShowSummary}
      />
    </>
  );
}
