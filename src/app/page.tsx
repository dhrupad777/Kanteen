
import Link from 'next/link';
import { UserCog, ChefHat, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function RoleSelectionPage() {
  return (
    <>
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <Link href="/login">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 md:top-6 md:right-6 h-12 w-12 rounded-full bg-muted hover:bg-muted/80"
          >
            <UserCog className="h-6 w-6 text-muted-foreground" />
            <span className="sr-only">Order Manager Login</span>
          </Button>
      </Link>
      <header className="text-center mb-8 flex flex-col items-center">
        <ChefHat className="w-16 h-16 md:w-24 md:h-24 mb-4 text-primary" strokeWidth={1} />
        <h1 className="font-headline text-4xl md:text-5xl font-bold text-primary tracking-tighter">
          Kanteen <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">MRC</span>
        </h1>
        <p className="text-muted-foreground text-sm md:text-base mt-2 max-w-md">
          Your Campus Canteen Companion.
        </p>
      </header>

      <main className="flex justify-center w-full max-w-xs sm:max-w-sm">
        <RoleCard
          href="/student"
          icon={<ClipboardList className="w-10 h-10 md:w-12 md:h-12 text-primary" />}
          title="Order Status"
          description="View the live order status display."
        />
      </main>
      <footer className="mt-16 text-center text-muted-foreground text-sm">
        <p>&copy; {new Date().getFullYear()} Kanteen MRC. All rights reserved.</p>
      </footer>
    </div>
    </>
  );
}

interface RoleCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

function RoleCard({ href, icon, title, description }: RoleCardProps) {
  return (
    <Link href={href} className="group block w-full">
      <Card className="h-full hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 ease-in-out border-2 border-primary/50 bg-card/60 backdrop-blur-sm p-2 md:p-4 rounded-2xl animate-pulse-border">
        <CardHeader className="flex flex-col items-center text-center">
          <div className="p-3 md:p-4 bg-primary/10 rounded-full mb-4 transition-all duration-300 group-hover:bg-primary/20 group-hover:scale-110">{icon}</div>
          <CardTitle className="font-headline text-2xl md:text-3xl transition-colors group-hover:text-primary">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-center px-2 md:px-6">
          <p className="text-muted-foreground mb-4 h-10">{description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
