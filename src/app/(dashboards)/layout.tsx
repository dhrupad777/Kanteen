
import { KanteenHeader } from "@/components/kanteen-header";
import { OrderProvider } from "@/contexts/order-provider";
import { MenuProvider } from "@/contexts/menu-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OrderProvider>
      <MenuProvider>
        <div className="flex flex-col min-h-screen">
          <KanteenHeader />
          <main className="flex-1 container py-8">
            {children}
          </main>
        </div>
      </MenuProvider>
    </OrderProvider>
  );
}
