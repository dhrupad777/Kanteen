import { OrderProvider } from "@/contexts/order-provider";
import { MenuProvider } from "@/contexts/menu-provider";

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
    return (
        <OrderProvider>
            <MenuProvider>
                {children}
            </MenuProvider>
        </OrderProvider>
    );
}
