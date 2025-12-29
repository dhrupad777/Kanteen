import { adminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Updates or creates the daily report document by incrementing totals 
 * from the provided fulfilled order data.
 */
export async function updateDailyReportOnCompletion(orderData: any) {
    try {
        const date = new Date().toISOString().split('T')[0];
        const reportRef = adminDb.collection('daily_reports').doc(date);

        await adminDb.runTransaction(async (transaction) => {
            const reportSnapshot = await transaction.get(reportRef);

            if (!reportSnapshot.exists) {
                // Initialize report if it doesn't exist for today
                const initialItemSummary: { [name: string]: number } = {};
                if (orderData.items && Array.isArray(orderData.items)) {
                    orderData.items.forEach((item: any) => {
                        const name = item.name || 'Unknown';
                        const qty = item.quantity || 0;
                        initialItemSummary[name] = qty;
                    });
                }

                transaction.set(reportRef, {
                    date,
                    totalOrders: 1,
                    totalRevenue: orderData.totalPrice || 0,
                    itemSummary: initialItemSummary,
                    generatedAt: FieldValue.serverTimestamp(),
                });
            } else {
                // Update existing report using increment
                const updateData: any = {
                    totalOrders: FieldValue.increment(1),
                    totalRevenue: FieldValue.increment(orderData.totalPrice || 0),
                    generatedAt: FieldValue.serverTimestamp(),
                };

                // Add item counts to update data
                if (orderData.items && Array.isArray(orderData.items)) {
                    orderData.items.forEach((item: any) => {
                        const name = item.name || 'Unknown';
                        const qty = item.quantity || 0;
                        // Use dot notation to update nested field
                        updateData[`itemSummary.${name}`] = FieldValue.increment(qty);
                    });
                }

                transaction.update(reportRef, updateData);
            }
        });
        console.log(`Successfully updated daily report for ${date}`);
    } catch (error) {
        console.error('Error updating daily report:', error);
    }
}
