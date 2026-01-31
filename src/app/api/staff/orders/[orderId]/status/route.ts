import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { checkManagerAllowlist, BYPASS_AUTH } from '@/lib/auth';
import { updateDailyReportOnCompletion } from '@/lib/reports-admin';
import { rateLimit, getClientIP } from '@/lib/rate-limit';

// Valid status values
const VALID_STATUSES = ['PAID', 'Preparing', 'Ready', 'Completed', 'PICKED_UP', 'Cancelled'];

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ orderId: string }> }
) {
    try {
        // Rate limit by IP (20 status updates per minute)
        const clientIP = getClientIP(request);
        const { success: rateLimitOk, resetIn } = rateLimit(`status-update:${clientIP}`, 20, 60000);
        if (!rateLimitOk) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: { 'Retry-After': Math.ceil(resetIn / 1000).toString() }
                }
            );
        }

        const { orderId } = await params;
        const { status } = await request.json();

        // Input validation
        if (!orderId || typeof orderId !== 'string' || orderId.length > 100) {
            return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
        }

        if (!status || typeof status !== 'string' || !VALID_STATUSES.includes(status)) {
            return NextResponse.json(
                { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
                { status: 400 }
            );
        }

        let userId = 'test-user-123';

        // Skip authentication if in testing mode
        if (!BYPASS_AUTH) {
            const authHeader = request.headers.get('Authorization');
            if (!authHeader?.startsWith('Bearer ')) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            const idToken = authHeader.split('Bearer ')[1];
            const decodedToken = await adminAuth.verifyIdToken(idToken);
            const email = decodedToken.email;
            userId = decodedToken.uid;

            if (!email) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            // Verify if the user is a manager (server-side check)
            const allowlistRef = adminDb.collection('manager_allowlist').doc(email.toLowerCase());
            const allowlistSnap = await allowlistRef.get();
            if (!allowlistSnap.exists || allowlistSnap.data()?.enabled !== true) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        } else {
            console.log("🔓 AUTH BYPASS: Skipping authentication in status route");
        }

        const updateData: any = {
            status,
            'kitchen.updatedBy': userId
        };

        if (status === 'Preparing') {
            updateData['kitchen.markedPreparingAt'] = FieldValue.serverTimestamp();
        } else if (status === 'Ready') {
            updateData['kitchen.readyAt'] = FieldValue.serverTimestamp();
        }

        const orderRef = adminDb.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }
        const orderData = orderSnap.data();

        await orderRef.update(updateData);

        // If newly completed, update the daily report
        if (status === 'Completed' && orderData?.status !== 'Completed') {
            await updateDailyReportOnCompletion({ ...orderData, status: 'Completed' });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Status update error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

