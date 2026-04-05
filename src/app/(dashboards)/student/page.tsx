"use client";

import { useMemo, useEffect, useState, useCallback } from 'react';
import { useOrders } from '@/contexts/order-provider';
import { OrderCard } from '@/components/order-card';
import { Order } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CupSoda, ShoppingBag, ChefHat, CheckCircle2, X, BellOff, Bell, Smartphone, Share, Download, Wrench } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import Link from "next/link";
import { MenuDisplay } from '@/components/menu-display';
import { StudentDashboardSkeleton } from '@/components/skeletons';
import { motion, AnimatePresence } from 'framer-motion';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { useOrderReadyAlert, playOrderChime } from '@/hooks/use-order-ready-alert';
import { useInstallPrompt } from '@/hooks/use-install-prompt';

export default function StudentDashboardPage() {
  const { orders, loading: ordersLoading } = useOrders();
  const { user, userProfile, loading: authLoading } = useAuth();

  // In-app chime + vibration when order status → Ready
  useOrderReadyAlert(orders, user?.uid);

  // Also play chime when service worker broadcasts a push (covers bg → fg transition)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'KANTEEN_ORDER_READY') playOrderChime();
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // Maintenance mode — controlled from /counter toggle
  const [orderingEnabled, setOrderingEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'canteen_state', 'settings'),
      (snap) => setOrderingEnabled(snap.exists() ? snap.data().studentOrderingEnabled !== false : true),
      () => setOrderingEnabled(true), // on error, default open
    );
    return () => unsub();
  }, []);

  const { supported, permission, subscribed, iosNeedsInstall, subscribe, unsubscribe, loading: pushLoading } = usePushNotifications();
  const { isInstallable, isInstalled, installApp } = useInstallPrompt();

  const handleBellClick = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    if (subscribed) {
      await unsubscribe(token);
    } else {
      await subscribe(token);
    }
  }, [user, subscribed, subscribe, unsubscribe]);

  // Combined engagement prompt (notifications + install) — shown after first order confirmation
  const NOTIF_SNOOZE_KEY = 'kanteen_notif_prompt_snoozed';
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [installing, setInstalling] = useState(false);

  const handleEnableNotifications = useCallback(async () => {
    setShowNotifPrompt(false);
    if (!user) return;
    const token = await user.getIdToken();
    await subscribe(token);
  }, [user, subscribe]);

  const handleSnoozeNotifications = useCallback(() => {
    localStorage.setItem(NOTIF_SNOOZE_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setShowNotifPrompt(false);
  }, []);

  const handleInstallApp = useCallback(async () => {
    setInstalling(true);
    await installApp();
    setInstalling(false);
    setShowNotifPrompt(false);
  }, [installApp]);

  // Only fire if something useful to show
  const triggerEngagementPrompt = useCallback(() => {
    const needsNotif = supported && !subscribed && permission !== 'denied';
    const needsInstall = !isInstalled && (isInstallable || iosNeedsInstall);
    if (!needsNotif && !needsInstall) return;
    const snoozed = localStorage.getItem(NOTIF_SNOOZE_KEY);
    if (snoozed && Date.now() < Number(snoozed)) return;
    setTimeout(() => setShowNotifPrompt(true), 700);
  }, [supported, subscribed, permission, isInstalled, isInstallable, iosNeedsInstall]);

  // Order confirmation popup state
  const [orderConfirmed, setOrderConfirmed] = useState<{ token: number; orderId: string } | null>(null);
  const SUPPRESS_KEY = 'kanteen_suppress_order_popup';

  const dismissPopup = useCallback(() => {
    setOrderConfirmed(null);
    triggerEngagementPrompt();
  }, [triggerEngagementPrompt]);

  const dismissAndSuppress = useCallback(() => {
    localStorage.setItem(SUPPRESS_KEY, '1');
    setOrderConfirmed(null);
  }, []);

  // Auth check removed - dashboard is public

  const loading = ordersLoading || authLoading;

  // Check for order confirmation from payment redirect
  useEffect(() => {
    const data = sessionStorage.getItem('orderConfirmed');
    if (data) {
      sessionStorage.removeItem('orderConfirmed');
      // Skip popup if user has opted out
      if (localStorage.getItem(SUPPRESS_KEY) === '1') return;
      try {
        setOrderConfirmed(JSON.parse(data));
        // Auto-dismiss after 8 seconds, then show engagement prompt
        const timer = setTimeout(() => {
          setOrderConfirmed(null);
          triggerEngagementPrompt();
        }, 8000);
        return () => clearTimeout(timer);
      } catch (e) {
        // malformed data — silently discard
      }
    }
  // triggerEngagementPrompt intentionally omitted — stable enough, avoids re-running on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Memoize filtered orders to prevent unnecessary recalculations
  const myActiveOrders = useMemo(() =>
    orders.filter(o =>
      o.studentId === user?.uid &&
      ['Preparing', 'Ready'].includes(o.status)
    ).sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)),
    [orders, user?.uid]
  );

  // Offline/walk-in orders being prepared — visible to everyone (all logged-in or guest users)
  const publicPreparingOrders = useMemo(() =>
    orders.filter(o =>
      o.status === 'Preparing' &&
      (!o.token || o.token < 201) // Offline tokens (1-200) or no token
    ).sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)),
    [orders]
  );

  // Offline/walk-in orders ready for pickup — visible to everyone
  const publicReadyOrders = useMemo(() =>
    orders.filter(o =>
      o.status === 'Ready' &&
      (!o.token || o.token < 201) // Offline tokens (1-200) or no token
    ).sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)),
    [orders]
  );

  if (loading || orderingEnabled === null) {
    return <StudentDashboardSkeleton />;
  }

  // NOTE: Do NOT block /student when orderingEnabled === false.
  // Students who already placed orders must always be able to see their token and OTP.
  // Only new orders are blocked — the "Order Online" CTA is hidden below instead.

  return (
    <div className="space-y-6">
      {/* Order Confirmed Dialog */}
      <AnimatePresence>
        {orderConfirmed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={dismissPopup}
          >
            <motion.div
              initial={{ opacity: 0, y: 80, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Auto-dismiss progress bar */}
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 8, ease: "linear" }}
                className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-orange-400 to-orange-600 origin-left"
              />

              {/* Close (X) button */}
              <button
                onClick={dismissPopup}
                className="absolute top-3 right-3 p-1.5 rounded-full text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="px-6 pt-7 pb-5 text-center">
                {/* Success icon */}
                <motion.div
                  initial={{ scale: 0, rotate: -15 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 220 }}
                  className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3"
                >
                  <CheckCircle2 className="w-7 h-7 text-green-500" />
                </motion.div>

                <h2 className="text-lg font-bold text-gray-900 mb-0.5">Order Confirmed!</h2>
                <p className="text-xs text-gray-400 mb-3">Your order is now with the kitchen</p>

                {/* Token number */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-4 my-1 text-white shadow-lg shadow-orange-200"
                >
                  <p className="text-orange-200 text-[9px] font-black uppercase tracking-[0.2em] mb-0.5">Your Token</p>
                  <p className="text-6xl font-black tracking-tight leading-none">{orderConfirmed.token}</p>
                </motion.div>

                <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mt-3 mb-5">
                  <ChefHat className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>OTP appears on your dashboard when order is ready</span>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={dismissPopup}
                    className="w-full py-3 rounded-2xl bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white font-semibold text-sm transition-all"
                  >
                    Got it!
                  </button>
                  <button
                    onClick={dismissAndSuppress}
                    className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-2xl text-gray-400 hover:text-gray-600 hover:bg-gray-50 active:scale-[0.98] text-xs font-medium transition-all"
                  >
                    <BellOff className="w-3.5 h-3.5" />
                    Don&apos;t show this again
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Combined engagement prompt — shown after order confirmation */}
      <AnimatePresence>
        {showNotifPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={handleSnoozeNotifications}
          >
            <motion.div
              initial={{ opacity: 0, y: 60, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Orange top stripe */}
              <div className="h-1 bg-gradient-to-r from-orange-400 to-orange-600" />

              <div className="px-6 pt-5 pb-6">
                {/* Close */}
                <button
                  onClick={handleSnoozeNotifications}
                  className="absolute top-3 right-3 p-1.5 rounded-full text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Icon */}
                <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mb-4">
                  <Bell className="w-6 h-6 text-orange-500" />
                </div>

                <h2 className="text-lg font-bold text-gray-900 mb-1">
                  Know when your order is ready
                </h2>
                <p className="text-sm text-gray-500 mb-5">
                  Get notified the moment your food is ready for pickup — no need to keep checking.
                </p>

                {/* Platform-specific instructions */}
                <div className="space-y-2 mb-5">
                  {iosNeedsInstall ? (
                    // iOS Safari — must add to home screen before notifications work
                    <>
                      <div className="rounded-2xl bg-amber-50 border border-amber-100 px-3.5 py-3 mb-1">
                        <p className="text-xs font-semibold text-amber-700 mb-0.5">iPhone / iPad</p>
                        <p className="text-xs text-amber-700 leading-snug">
                          To receive notifications on iOS, you must first add Kanteen to your Home Screen.
                        </p>
                      </div>
                      <div className="flex items-start gap-3 bg-gray-50 rounded-2xl px-3.5 py-3">
                        <Share className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-gray-600 leading-snug">
                          <span className="font-semibold text-gray-800">Step 1 —</span> Tap the <span className="font-semibold text-gray-800">Share</span> button in Safari, then tap <span className="font-semibold text-gray-800">Add to Home Screen</span>.
                        </p>
                      </div>
                      <div className="flex items-start gap-3 bg-gray-50 rounded-2xl px-3.5 py-3">
                        <Bell className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-gray-600 leading-snug">
                          <span className="font-semibold text-gray-800">Step 2 —</span> Open Kanteen from your Home Screen and tap <span className="font-semibold text-gray-800">Enable Notifications</span> below.
                        </p>
                      </div>
                    </>
                  ) : (
                    // Android / Desktop
                    <>
                      <div className="flex items-start gap-3 bg-gray-50 rounded-2xl px-3.5 py-3">
                        <Smartphone className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-gray-600 leading-snug">
                          Tap <span className="font-semibold text-gray-800">Enable Notifications</span> below and hit <span className="font-semibold text-gray-800">Allow</span> when your browser asks.
                        </p>
                      </div>
                      <div className="flex items-start gap-3 bg-amber-50 rounded-2xl px-3.5 py-3">
                        <span className="text-sm leading-none mt-0.5 shrink-0">⚡</span>
                        <p className="text-xs text-gray-600 leading-snug">
                          <span className="font-semibold text-gray-800">On Android —</span> Allow Chrome <span className="font-semibold">No restrictions</span> in battery settings so alerts reach you in the background.
                        </p>
                      </div>
                      {/* Install option if available */}
                      {!isInstalled && isInstallable && (
                        <div className="flex items-center justify-between gap-3 bg-gray-50 rounded-2xl px-3.5 py-3">
                          <div className="flex items-start gap-3">
                            <Download className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-gray-600 leading-snug">
                              <span className="font-semibold text-gray-800">Add to Home Screen</span> for instant one-tap access.
                            </p>
                          </div>
                          <button
                            onClick={handleInstallApp}
                            disabled={installing}
                            className="shrink-0 text-xs font-semibold text-orange-500 hover:text-orange-600 disabled:opacity-50 transition-colors"
                          >
                            {installing ? 'Installing…' : 'Install'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleEnableNotifications}
                    disabled={pushLoading || iosNeedsInstall}
                    className="w-full py-3 rounded-2xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 active:scale-[0.98] text-white font-semibold text-sm transition-all"
                  >
                    {iosNeedsInstall ? 'Add to Home Screen first' : 'Enable Notifications'}
                  </button>
                  <button
                    onClick={handleSnoozeNotifications}
                    className="w-full py-2.5 rounded-2xl text-gray-400 hover:text-gray-600 hover:bg-gray-50 active:scale-[0.98] text-xs font-medium transition-all"
                  >
                    Not now
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {user && (
        <div className="flex items-center justify-between gap-3 border-b pb-4">
          <h1 className="font-headline text-3xl font-bold text-primary">
            Hello, {userProfile?.name?.split(' ')[0] || user.displayName?.split(' ')[0] || ''}
          </h1>

          {/* Notification bell — only shown for logged-in users on supported browsers */}
          {supported && !iosNeedsInstall && permission !== 'denied' && (
            <button
              onClick={handleBellClick}
              disabled={pushLoading}
              title={subscribed ? 'Notifications on — tap to turn off' : 'Tap to get notified when your order is ready'}
              className={cn(
                "relative p-2 rounded-full transition-all active:scale-95",
                subscribed
                  ? "text-orange-500 bg-orange-50 hover:bg-orange-100"
                  : "text-gray-400 hover:text-orange-500 hover:bg-orange-50"
              )}
            >
              {subscribed
                ? <Bell className="w-5 h-5 fill-orange-500 text-orange-500" />
                : <Bell className="w-5 h-5" />
              }
              {subscribed && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full ring-2 ring-white" />
              )}
            </button>
          )}

          {/* iOS: needs PWA install first */}
          {supported && iosNeedsInstall && (
            <span className="text-[10px] text-muted-foreground text-right leading-tight max-w-[120px]">
              Add to Home Screen to enable notifications
            </span>
          )}

          {/* Permission blocked */}
          {supported && permission === 'denied' && (
            <span title="Allow notifications in your browser settings" className="p-2">
              <BellOff className="w-5 h-5 text-gray-300" />
            </span>
          )}
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

      {orderingEnabled === false ? (
        /* Maintenance — show a quiet notice instead of the order CTA */
        <div className="rounded-2xl border border-orange-100 bg-orange-50 px-5 py-4 flex items-center gap-3">
          <Wrench className="h-5 w-5 text-orange-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-orange-800">Online ordering is paused</p>
            <p className="text-xs text-orange-600 mt-0.5">We are adding some new features, see you soon — Kanteen</p>
          </div>
        </div>
      ) : (
        <Link href="/order" className="block w-full group">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-400 via-orange-500 to-red-600 shadow-lg shadow-orange-500/25 transition-transform duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]">
            {/* Decorative blobs */}
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
            <div className="absolute -bottom-6 -left-4 w-32 h-32 bg-orange-300/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <div className="relative flex flex-col items-center justify-center text-center px-6 py-6 gap-1">
              <span className="text-white/80 text-[10px] font-black uppercase tracking-[0.25em]">Tap to browse menu</span>
              <span className="text-white font-black text-2xl tracking-tight leading-tight">Order Online</span>
              <span className="text-orange-100 text-xs font-medium opacity-80 mt-0.5">Order. Arrive. Eat.</span>
            </div>
          </div>
        </Link>
      )}

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
          badge="Offline order"
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
  badge?: string;
  icon: React.ReactNode;
  orders: Order[];
  emptyMessage: string;
  className?: string;
}

function DashboardSection({
  title,
  badge,
  icon,
  orders,
  emptyMessage,
  className,
}: DashboardSectionProps) {
  return (
    <Card className={cn("border shadow-sm", className)}>
      <CardHeader>
        <CardTitle className="font-headline text-xl md:text-2xl font-bold flex items-center justify-between gap-3 text-foreground/80">
          <div className="flex items-center gap-3 flex-wrap">
            {icon}
            <span>{title} ({orders.length})</span>
            {badge && (
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 bg-black/5 rounded-full px-2 py-0.5 normal-case">
                {badge}
              </span>
            )}
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
          <AnimatePresence mode="popLayout">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
            {orders.map((order, index) => (
              <motion.div
                key={order.id}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1, transition: { delay: Math.min(index * 0.05, 0.2), type: 'spring', stiffness: 300, damping: 24 } }}
                exit={{ opacity: 0, scale: 0.75, y: -8, transition: { duration: 0.25, ease: 'easeIn' } }}
                className="relative group"
              >
                <OrderCard
                  order={order}
                  role="student"
                />
              </motion.div>
            ))}
          </div>
          </AnimatePresence>
        ) : (
          <p className="text-muted-foreground p-4 text-center">{emptyMessage}</p>
        )}
      </CardContent>
    </Card>
  )
}
