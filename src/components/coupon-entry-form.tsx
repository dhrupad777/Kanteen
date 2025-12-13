
"use client";

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useOrders } from '@/contexts/order-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Ticket, PlusCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const formSchema = z.object({
  couponId: z.coerce
    .number({invalid_type_error: "Please enter a valid number."})
    .int()
    .positive("Coupon number must be a positive number.")
    .min(1, 'Coupon number must be at least 1.')
    .max(300, 'Coupon number must be no more than 300.'),
});

export function CouponEntryForm() {
  const { addOrder } = useOrders();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      couponId: undefined,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
        await addOrder(values.couponId.toString());
        form.reset({couponId: undefined});
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Duplicate Order",
            description: error.message,
        })
    }
  }

  return (
    <Card className="bg-secondary/40 border-0">
      <CardHeader>
        <CardTitle className="font-headline text-xl md:text-2xl flex items-center gap-2">
            <Ticket className="text-primary"/>
            Create New Order
        </CardTitle>
        <CardDescription>Enter a coupon number (1-300) to add an order to the 'Ready' queue.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
            <FormField
              control={form.control}
              name="couponId"
              render={({ field }) => (
                <FormItem className="flex-grow w-full">
                  <FormLabel>Coupon Number</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min="1" 
                      max="300" 
                      placeholder="e.g. 42" 
                      {...field} 
                      value={field.value ?? ''} 
                      className="bg-background"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" size="lg" className="w-full sm:w-auto flex-shrink-0">
              <PlusCircle />
              Add Order
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
