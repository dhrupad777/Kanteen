
"use client";

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { KanteenHeader } from '@/components/kanteen-header';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Info } from 'lucide-react';
import Link from 'next/link';

const formSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
});

export default function LoginPage() {
  const { user, signInWithEmail, loading } = useAuth();
  const router = useRouter();
  const [authError, setAuthError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    if (user) {
      router.push('/staff');
    }
  }, [user, router]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setAuthError(null);
    try {
      await signInWithEmail(values.email, values.password);
      router.push('/staff');
    } catch (error: any) {
        setAuthError("Invalid email or password. Please try again.");
        console.error("Authentication Error:", error);
    }
  }

  if (loading || user) {
    return (
      <div className="flex flex-col min-h-screen">
         <KanteenHeader/>
        <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <>
      <KanteenHeader/>
      <div className="flex items-center justify-center min-h-screen bg-background -mt-20">
        <Card className="mx-auto max-w-sm w-full">
          <CardHeader>
            <CardTitle className="text-2xl font-headline">Manager Login</CardTitle>
            <CardDescription>
              Enter your credentials to access the order manager dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="manager@kanteen-mrc.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 {authError && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Login Failed</AlertTitle>
                        <AlertDescription>{authError}</AlertDescription>
                    </Alert>
                )}
                <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Login
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
