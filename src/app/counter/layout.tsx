import { MenuProvider } from "@/contexts/menu-provider";

export default function CounterLayout({ children }: { children: React.ReactNode }) {
    return <MenuProvider>{children}</MenuProvider>;
}
