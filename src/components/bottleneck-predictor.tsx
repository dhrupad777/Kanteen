"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { predictBottlenecks, PredictBottlenecksOutput } from '@/ai/flows/bottleneck-prediction';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Lightbulb, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

const formSchema = z.object({
  historicalOrderData: z.string().min(50, 'Please provide more detailed historical data.'),
  foodPreparationProcesses: z.string().min(50, 'Please provide a more detailed process description.'),
});

const placeholderData = {
    historical: `Orders (last 2 hours):
- 12:00 PM: 5x Spicy Chicken Burger, 2x Veggie Wrap
- 12:05 PM: 3x Pasta Alfredo, 3x Fries
- 12:10 PM: 10x Iced Coffee
- Peak time: 12:30 PM - 1:30 PM, average wait time increases by 15 minutes.
- Burger station: 1 grill, 2 staff. Prep time: 7 mins/burger.
- Pasta station: 2 pots, 1 staff. Prep time: 12 mins/pasta.
- Fryer: 1 large fryer, shared. Prep time: 5 mins/batch.`,
    processes: `Processes:
- Burger station: Patties are grilled to order. Buns are toasted simultaneously. Assembly takes 2 minutes.
- Pasta station: Water is kept at a boil. Pasta is cooked in batches. Sauce is pre-made but needs reheating.
- Drinks: Iced coffee is brewed in large urns, poured on demand. Smoothies are blended to order.
- Staffing: 3 kitchen staff during peak hours. 1 cashier.`,
};


export function BottleneckPredictor() {
  const [prediction, setPrediction] = useState<PredictBottlenecksOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      historicalOrderData: placeholderData.historical,
      foodPreparationProcesses: placeholderData.processes,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setError(null);
    setPrediction(null);
    try {
      const result = await predictBottlenecks(values);
      setPrediction(result);
    } catch (e) {
      setError('An error occurred while generating the prediction. Please try again.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline text-2xl">Predict Bottlenecks</CardTitle>
          <CardDescription>Use AI to analyze your processes and identify potential slowdowns before they happen. Enter your canteen's data below.</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="historicalOrderData"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Historical Order Data</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Describe peak times, popular items, prep times..." {...field} rows={8} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="foodPreparationProcesses"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Food Preparation Processes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Describe steps, equipment, staff allocation..." {...field} rows={8} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? 'Analyzing...' : 'Generate Prediction'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
      
      {error && (
        <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {prediction && (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline text-2xl flex items-center gap-2">
                    <Lightbulb className="text-primary"/>
                    Prediction Results
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                 <div>
                    <h3 className="font-bold text-lg text-foreground mb-2">Potential Bottlenecks</h3>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                        {prediction.potentialBottlenecks.map((item, index) => <li key={index}>{item}</li>)}
                    </ul>
                 </div>
                 <div>
                    <h3 className="font-bold text-lg text-foreground mb-2">Recommendations</h3>
                    <p className="text-muted-foreground whitespace-pre-wrap">{prediction.recommendations}</p>
                 </div>
            </CardContent>
        </Card>
      )}
    </div>
  );
}
