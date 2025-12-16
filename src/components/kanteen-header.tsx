
"use client"
import Link from "next/link"
import { ChefHat, UserCog } from "lucide-react"
import { usePathname } from 'next/navigation'
import { Button } from "./ui/button"

export function KanteenHeader() {
  const pathname = usePathname();

  // Only show login button on main page
  const showLoginButton = pathname === '/';

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/80 backdrop-blur-sm">
      <div className="container flex h-16 items-center">
        <Link href="/" className="flex items-center gap-2 mr-auto">
          <ChefHat className="h-7 w-7 text-primary" />
          <span className="font-headline text-2xl font-bold text-foreground">
            Kanteen <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">MRC</span>
          </span>
        </Link>

        <div className="flex items-center justify-end gap-4">
          {showLoginButton && (
            <Link href="/login">
              <Button variant="ghost" size="icon" className="h-12 w-12 rounded-full bg-muted hover:bg-muted/80">
                <UserCog className="h-6 w-6 text-muted-foreground" />
                <span className="sr-only">Manager Login</span>
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
