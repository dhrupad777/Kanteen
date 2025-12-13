'use server';

/**
 * @fileOverview This file defines a Genkit flow for predicting potential bottlenecks in the canteen's food preparation process.
 *
 * - predictBottlenecks - A function that triggers the bottleneck prediction flow.
 * - PredictBottlenecksInput - The input type for the predictBottlenecks function.
 * - PredictBottlenecksOutput - The return type for the predictBottlenecks function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const PredictBottlenecksInputSchema = z.object({
  historicalOrderData: z
    .string()
    .describe(
      'Historical order data, including order timestamps, items ordered, and preparation times.'
    ),
  foodPreparationProcesses: z
    .string()
    .describe(
      'Description of the food preparation processes, including steps, equipment used, and staff involved.'
    ),
});
export type PredictBottlenecksInput = z.infer<typeof PredictBottlenecksInputSchema>;

const PredictBottlenecksOutputSchema = z.object({
  potentialBottlenecks: z
    .array(z.string())
    .describe('A list of potential bottlenecks in the food preparation process.'),
  recommendations: z
    .string()
    .describe(
      'Recommendations for adjusting staffing, resource allocation, or menu offerings to optimize efficiency.'
    ),
});
export type PredictBottlenecksOutput = z.infer<typeof PredictBottlenecksOutputSchema>;

export async function predictBottlenecks(input: PredictBottlenecksInput): Promise<PredictBottlenecksOutput> {
  return predictBottlenecksFlow(input);
}

const prompt = ai.definePrompt({
  name: 'predictBottlenecksPrompt',
  input: {schema: PredictBottlenecksInputSchema},
  output: {schema: PredictBottlenecksOutputSchema},
  prompt: `You are an AI assistant helping canteen managers to predict potential bottlenecks in their food preparation process.

  Analyze the following historical order data and food preparation processes to identify potential bottlenecks and provide recommendations for improvement.

  Historical Order Data:
  {{historicalOrderData}}

  Food Preparation Processes:
  {{foodPreparationProcesses}}

  Based on your analysis, identify potential bottlenecks and provide specific recommendations for adjusting staffing, resource allocation, or menu offerings to optimize efficiency.

  Format your output as a JSON object with the following structure:
  {
    "potentialBottlenecks": ["bottleneck 1", "bottleneck 2", ...],
    "recommendations": "Specific recommendations for improvement."
  }`,
});

const predictBottlenecksFlow = ai.defineFlow(
  {
    name: 'predictBottlenecksFlow',
    inputSchema: PredictBottlenecksInputSchema,
    outputSchema: PredictBottlenecksOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
