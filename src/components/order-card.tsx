
"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Order } from "@/types";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "./ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrders } from "@/contexts/order-provider";
import { OrderSummaryDialog } from "./order-summary-dialog";
import { springs, celebrateScale } from "@/lib/motion-utils";

interface OrderCardProps {
  order: Order;
  role: 'student' | 'staff';
}

export function OrderCard({ order, role }: OrderCardProps) {
  const { updateOrderStatus } = useOrders();
  const [showSummary, setShowSummary] = useState(false);
  const [prevStatus, setPrevStatus] = useState(order.status);
  const [showCelebration, setShowCelebration] = useState(false);

  const displayId = order.token ? order.token.toString() : (order.studentId.split('-')[1] || order.id);

  // Get OTP from order or localStorage, filtering out invalid values like "undefined" string
  const getOtp = () => {
    if (order.secretOtp) return order.secretOtp;
    if (typeof window === 'undefined') return null;
    const storedOtp = localStorage.getItem(`kanteen_otp_${order.id}`);
    // Filter out invalid stored values
    if (!storedOtp || storedOtp === 'undefined' || storedOtp === 'null') return null;
    return storedOtp;
  };
  const otp = getOtp();

  // Celebrate when status changes to "Ready"
  useEffect(() => {
    if (order.status === 'Ready' && prevStatus === 'Preparing') {
      setShowCelebration(true);
      const timer = setTimeout(() => setShowCelebration(false), 1000);
      return () => clearTimeout(timer);
    }
    setPrevStatus(order.status);
  }, [order.status, prevStatus]);

  const handleStatusUpdate = () => {
    updateOrderStatus(order.id, 'Completed');
  };

  // Status-based styling
  const statusStyles = {
    Preparing: 'bg-blue-200/90 dark:bg-blue-900/50 text-blue-900 dark:text-blue-200',
    Ready: 'bg-green-200/90 dark:bg-green-900/50 text-green-900 dark:text-green-200',
  };

  return (
    <>
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        whileHover={role === 'student' ? { y: -4, transition: springs.soft } : undefined}
        whileTap={role === 'student' ? { scale: 0.98 } : undefined}
      >
        <Card
          onClick={() => role === 'student' && setShowSummary(true)}
          className={cn(
            "flex flex-col w-full relative transition-shadow duration-300",
            {
              "overflow-hidden border-0 shadow-md hover:shadow-xl cursor-pointer": role === 'student',
              "flex-row items-center p-0": role === 'staff',
            },
            showCelebration && "animate-glow"
          )}
        >
          <CardContent className={cn("flex-grow flex flex-col justify-center items-center text-center", {
            "p-0": role === 'student',
            "p-0 flex-shrink-0": role === 'staff'
          })}>
            <motion.div
              className={cn(
                "rounded-lg p-2 w-full font-bold tracking-wider flex flex-col items-center justify-center",
                role === 'student' ? 'p-1.5 sm:p-2' : 'text-base px-1.5 py-1',
                statusStyles[order.status as keyof typeof statusStyles] || ''
              )}
              animate={showCelebration ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.3 }}
            >
              <div className="flex flex-col items-center">
                {/* Animated order number */}
                <AnimatePresence mode="popLayout">
                  <motion.p
                    key={displayId}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={springs.bouncy}
                    className={cn("font-mono tabular-nums leading-none font-black",
                      role === 'student' ? 'text-4xl sm:text-5xl md:text-6xl' : 'text-xl'
                    )}
                  >
                    {displayId}
                  </motion.p>
                </AnimatePresence>

                {role === 'staff' && order.userEmail && (
                  <p className="text-[10px] leading-tight font-medium opacity-80 mt-0.5 truncate max-w-[80px]">
                    {order.userEmail.split('@')[0]}
                  </p>
                )}
              </div>

              {/* OTP reveal with spring animation */}
              <AnimatePresence>
                {role === 'student' && order.status === 'Ready' && order.token && order.token >= 200 && otp && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={springs.bouncy}
                    className="mt-3 pt-3 w-full border-t border-green-400/30"
                  >
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="text-[10px] uppercase font-bold tracking-[0.2em] mb-1 text-green-800/60 dark:text-green-200/60"
                    >
                      Pick-up OTP
                    </motion.p>
                    <motion.p
                      variants={celebrateScale}
                      initial="initial"
                      animate="animate"
                      className="text-2xl md:text-3xl font-mono font-black tracking-[0.1em] text-green-900 dark:text-green-100"
                    >
                      {otp}
                    </motion.p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </CardContent>

          {role === 'staff' && (
            <CardFooter className="p-0 pl-1 pr-2 flex-grow">
              <motion.div
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.05 }}
                transition={springs.snappy}
              >
                <Button
                  onClick={handleStatusUpdate}
                  size="sm"
                  className="bg-primary hover:bg-primary/90 transition-colors font-semibold h-8 text-xs px-2 py-1"
                >
                  <Check className="mr-1 h-3 w-3" />
                  <span>Collected</span>
                </Button>
              </motion.div>
            </CardFooter>
          )}
        </Card>
      </motion.div>

      <OrderSummaryDialog
        order={order}
        isOpen={showSummary}
        onOpenChange={setShowSummary}
      />
    </>
  );
}
