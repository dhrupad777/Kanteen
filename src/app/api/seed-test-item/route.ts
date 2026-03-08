import { NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';

/**
 * POST /api/seed-test-item
 * Seeds a ₹1 test item into menu_items collection.
 * Auth-protected. Safe to call multiple times (uses fixed doc ID).
 */
export async function POST(request: Request) {
    try {
        // Verify auth
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await getAdminAuth().verifyIdToken(idToken);
        if (!decodedToken) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const db = getAdminDb();

        // Use a fixed doc ID so this is idempotent
        const testItemId = 'test_item_1_rupee';

        await db.collection('menu_items').doc(testItemId).set({
            name: 'Test Item (₹1)',
            price: 1,
            category: 'tea_beverage',
            isActive: true,
            isAvailable: true,
            sortOrder: 999,
            tags: ['veg', 'test'],
            imageUrl: '',
            updatedAt: new Date(),
        }, { merge: true });

        return NextResponse.json({
            success: true,
            message: 'Test item (₹1) added/updated successfully',
            itemId: testItemId,
        });
    } catch (error: any) {
        console.error('Seed test item error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to seed test item' },
            { status: 500 }
        );
    }
}
