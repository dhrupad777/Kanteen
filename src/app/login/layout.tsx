
import { AuthProvider } from "@/contexts/auth-provider";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
        {children}
    </AuthProvider>
  );
}
