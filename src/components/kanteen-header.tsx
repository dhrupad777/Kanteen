"use client"

import Link from "next/link"
import { ChefHat, UserCog, User, LogOut } from "lucide-react"
import { usePathname, useRouter } from 'next/navigation'
import { Button } from "./ui/button"
import { useAuth } from "@/hooks/use-auth"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function KanteenHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, userProfile, signOutUser } = useAuth();

  const showLoginButton = pathname === '/' && !user;

  const displayName = userProfile?.name || user?.displayName || '';
  const photoURL = userProfile?.photoURL || user?.photoURL || '';

  async function handleSignOut() {
    try {
      await signOutUser();
      router.push('/student');
    } catch {
      // Sign out failed silently — auth state will remain unchanged
    }
  }

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
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  aria-label="Account menu"
                >
                  <Avatar className="h-9 w-9 border border-primary/20 cursor-pointer hover:opacity-80 transition-opacity">
                    {photoURL ? (
                      <AvatarImage
                        src={photoURL}
                        alt={displayName}
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                    <AvatarFallback className="bg-primary/10">
                      <User className="h-5 w-5 text-primary" />
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="pb-1">
                  {displayName && (
                    <p className="font-semibold text-sm truncate">{displayName}</p>
                  )}
                  <p className="text-xs text-muted-foreground font-normal truncate">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            showLoginButton && (
              <Link href="/staff-login">
                <Button variant="ghost" size="icon" className="h-12 w-12 rounded-full bg-muted hover:bg-muted/80">
                  <UserCog className="h-6 w-6 text-muted-foreground" />
                  <span className="sr-only">Staff Login</span>
                </Button>
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  );
}
