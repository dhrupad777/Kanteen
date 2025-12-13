import type { OrderStatus } from "@/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChefHat, CheckCircle2, CircleDotDashed, CupSoda } from "lucide-react";

interface OrderStatusBadgeProps {
  status: OrderStatus;
}

const statusConfig = {
  Pending: {
    label: 'Pending',
    icon: <CircleDotDashed className="h-4 w-4" />,
    className: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700',
  },
  Preparing: {
    label: 'Preparing',
    icon: <ChefHat className="h-4 w-4" />,
    className: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700',
  },
  Ready: {
    label: 'Ready for Pickup',
    icon: <CupSoda className="h-4 w-4" />,
    className: 'bg-lime-200 text-lime-900 border-lime-400 dark:bg-lime-900/30 dark:text-lime-300 dark:border-lime-700 animate-pulse',
  },
  Completed: {
    label: 'Completed',
    icon: <CheckCircle2 className="h-4 w-4" />,
    className: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-700',
  },
};

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant="outline" className={cn("gap-2 text-sm font-medium", config.className)}>
      {config.icon}
      <span>{config.label}</span>
    </Badge>
  );
}
