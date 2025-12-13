
"use client"
import Link from "next/link"
import { ChefHat, LogOut, User } from "lucide-react"
import { usePathname, useRouter } from 'next/navigation'
import { Button } from "./ui/button"
import { useAuth } from "@/hooks/use-auth"

export function KanteenHeader() {
  const pathname = usePathname();
  const { user, userProfile, signOutUser } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOutUser();
    router.push('/login');
  }
  
  const getFirstName = (name: string | null | undefined) => {
    if (!name) return '';
    return name.split(' ')[0];
  }

  const isAuthPage = pathname === '/login' || pathname === '/signup';

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/80 backdrop-blur-sm">
      <div className="container flex h-16 items-center">
        <Link href="/" className="flex items-center gap-2 mr-auto">
          <ChefHat className="h-7 w-7 text-primary" />
          <span className="font-headline text-2xl font-bold text-foreground">
            Kanteen <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">MRC BLR</span>
          </span>
        </Link>
        
        <div className="flex items-center justify-end gap-4">
           {user && userProfile && (
            <>
                <span className="text-sm font-medium text-foreground/80 hidden sm:block">
                  Hello, {getFirstName(userProfile.name)}!
                </span>
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
