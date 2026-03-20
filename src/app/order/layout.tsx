import { MenuProvider } from "@/contexts/menu-provider";

export default function OrderLayout({ children }: { children: React.ReactNode }) {
    return <MenuProvider>{children}</MenuProvider>;
}
