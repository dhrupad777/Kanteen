import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { AddPrintJobRequest } from '@/types';

/**
 * POST /api/print/add
 *
 * Adds a new print job to the queue.
 * Called when an order payment is confirmed.
 */
export async function POST(request: NextRequest) {
    try {
        // Authenticate Request
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const email = decodedToken.email;

        if (!email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body: AddPrintJobRequest = await request.json();

        // Validate required fields
        if (!body.orderId || body.token === undefined || !body.items || body.items.length === 0) {
            return NextResponse.json(
                { error: 'Missing required fields: orderId, token, items' },
                { status: 400 }
            );
        }

        // Create print job document
        const printJobRef = adminDb.collection('print_jobs').doc();
        await printJobRef.set({
            orderId: body.orderId,
            token: body.token,
            items: body.items,
            totalPrice: body.totalPrice || 0,
            customerName: body.customerName || null,
            customerEmail: body.customerEmail || null,
            isParcel: body.isParcel || false,
            status: 'pending',
            createdAt: FieldValue.serverTimestamp(),
            createdBy: decodedToken.uid,
        });

        return NextResponse.json({
            success: true,
            jobId: printJobRef.id,
        });
    } catch (error: any) {
        console.error('Add print job error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
