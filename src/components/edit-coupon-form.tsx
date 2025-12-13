
"use client";

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { AlertDialogCancel } from './ui/alert-dialog';

const formSchema = z.object({
  couponId: z.coerce
    .number({invalid_type_error: "Please enter a valid number."})
    .int()
    .positive("Coupon number must be a positive number.")
    .min(1, 'Coupon number must be at least 1.')
    .max(300, 'Coupon number must be no more than 300.'),
});

interface EditCouponFormProps {
    currentCoupon: number;
    onSubmit: (newCouponId: number) => void;
    onCancel: () => void;
}

export function EditCouponForm({ currentCoupon, onSubmit, onCancel }: EditCouponFormProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      couponId: currentCoupon,
    },
  });

  function handleFormSubmit(values: z.infer<typeof formSchema>) {
    onSubmit(values.couponId);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 pt-4">
        <FormField
          control={form.control}
          name="couponId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New Coupon Number</FormLabel>
              <FormControl>
                <Input 
                  type="number" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="1" 
                  max="300" 
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit">Save Changes</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
