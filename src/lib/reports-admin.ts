import { adminDb } from './firebase-admin';
import { FieldValue, Transaction } from 'firebase-admin/firestore';

/**
 * Updates the daily report document within a given transaction.
 * This ensures the Order Update and Report Update happen atomically.
 */
export function updateDailyReportTransaction(transaction: Transaction, orderData: any) {
    const date = new Date().toISOString().split('T')[0];
    const reportRef = adminDb.collection('daily_reports').doc(date);

    // Note: We cannot "await" the get here if we want to pipe it into the helper efficiently
    // simply by passing the transaction context. However, Firestore transactions require
    // strict "Reads before Writes" or providing the read document.
    // Since we can't easily pass the read doc without fetching it first, we will register the Set/Update 
    // operations on the transaction object. 

    // BUT: Transaction.set/update doesn't return a value, it just queues the op.
    // The issue is we need to know if the doc exists to decide between set() or update().
    // We MUST read it.

    // We'll throw an error if the transaction fails, bubbling up to the caller.

    // CRITICAL: In the standard Admin SDK, we can't do async work easily inside a helper 
    // that blindly gets called unless the caller awaits it.
    // So the caller MUST await this function.

    return transaction.get(reportRef).then((reportSnapshot) => {
        if (!reportSnapshot.exists) {
            // Initialize report
            const initialItemSummary: { [name: string]: number } = {};
            if (orderData.items && Array.isArray(orderData.items)) {
                orderData.items.forEach((item: any) => {
                    // Sanitize name to avoid nested field interpretation (e.g., "Mrs. Fields")
                    const name = (item.name || 'Unknown').replace(/\./g, '_');
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
            // Update existing
            const updateData: any = {
                totalOrders: FieldValue.increment(1),
                totalRevenue: FieldValue.increment(orderData.totalPrice || 0),
                generatedAt: FieldValue.serverTimestamp(),
            };

            if (orderData.items && Array.isArray(orderData.items)) {
                orderData.items.forEach((item: any) => {
                    const name = (item.name || 'Unknown').replace(/\./g, '_');
                    const qty = item.quantity || 0;
                    updateData[`itemSummary.${name}`] = FieldValue.increment(qty);
                });
            }

            transaction.update(reportRef, updateData);
        }
    });
}

/**
 * Legacy wrapper for standalone updates (non-transactional with order)
 */
export async function updateDailyReportOnCompletion(orderData: any) {
    try {
        await adminDb.runTransaction(async (transaction) => {
            await updateDailyReportTransaction(transaction, orderData);
        });
        console.log(`Successfully updated daily report for ${new Date().toISOString().split('T')[0]}`);
    } catch (error) {
        console.error('Error updating daily report:', error instanceof Error ? error.message : 'Unknown error');
    }
}
