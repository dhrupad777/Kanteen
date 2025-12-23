"use client";

import { ChefHat, Chrome, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { signInWithGoogle, checkStudentProfileExists } from '@/lib/auth';

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Auto-redirect logic
  useEffect(() => {
    async function checkStudent() {
      if (user) {
        // Check if student profile exists
        const exists = await checkStudentProfileExists(user.uid);
        if (exists) {
          router.replace("/student");
        } else {
          router.replace("/onboarding");
        }
      }
    }
    if (!loading) {
      checkStudent();
    }
  }, [loading, user, router]);

  async function handleStudentSignIn() {
    try {
      // Just sign in, the useEffect will handle redirection
      await signInWithGoogle();
    } catch (error) {
      console.error("Sign in failed", error);
    }
  }

  if (loading || user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <>
      <div className="relative flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <header className="text-center mb-12 flex flex-col items-center">
          <ChefHat className="w-20 h-20 md:w-32 md:h-32 mb-6 text-primary" strokeWidth={1} />
          <h1 className="font-headline text-5xl md:text-6xl font-bold text-primary tracking-tighter">
            Kanteen <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">MRC</span>
          </h1>
          <p className="text-muted-foreground text-lg md:text-xl mt-4 max-w-md">
            Your Campus Canteen Companion.
          </p>
        </header>

        <main className="flex flex-col items-center w-full max-w-xs sm:max-w-sm gap-6">
          <div className="text-center space-y-2">
            <p className="text-muted-foreground">
              Check order status and ready times.
            </p>
          </div>
          <Button
            className="w-full h-12 text-base"
            size="lg"
            onClick={handleStudentSignIn}
          >
            <Chrome className="mr-2 h-5 w-5" />
            Continue with Google (Student)
          </Button>
        </main>

        <footer className="absolute bottom-6 text-center text-muted-foreground text-xs">
          <p>&copy; {new Date().getFullYear()} Kanteen MRC.</p>
        </footer>
      </div>
    </>
  );
}
