
import { OrderProvider } from "@/contexts/order-provider";

export default function ReadyDisplayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OrderProvider>
        {children}
    </OrderProvider>
  );
}
