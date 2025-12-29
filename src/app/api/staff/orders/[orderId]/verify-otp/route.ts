import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { updateDailyReportOnCompletion } from '@/lib/reports-admin';

async function hashOTP(otp: string): Promise<string> {
    return crypto.createHash('sha256').update(otp).digest('hex');
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ orderId: string }> }
) {
    try {
        const { orderId } = await params;
        const { otp } = await request.json();

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

        // Verify manager
        const allowlistRef = adminDb.collection('manager_allowlist').doc(email.toLowerCase());
        const allowlistSnap = await allowlistRef.get();
        if (!allowlistSnap.exists || allowlistSnap.data()?.enabled !== true) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const orderRef = adminDb.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();

        if (!orderSnap.exists) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        const orderData = orderSnap.data();

        // 1. Check if already picked up
        if (orderData?.status === 'PICKED_UP') {
            return NextResponse.json({ error: 'Order already picked up' }, { status: 400 });
        }

        // 2. Check attempts
        const attempts = orderData?.otp?.attempts || 0;
        if (attempts >= 5) {
            return NextResponse.json({ error: 'Too many attempts. Order locked.' }, { status: 429 });
        }

        // 3. Verify OTP
        const submittedHash = await hashOTP(otp);
        if (submittedHash === orderData?.otpHash) {
            await orderRef.update({
                status: 'PICKED_UP',
                'otp.verifiedAt': FieldValue.serverTimestamp(),
                'kitchen.pickedUpAt': FieldValue.serverTimestamp(),
                'kitchen.updatedBy': decodedToken.uid
            });

            // Update the daily report for picked up orders
            await updateDailyReportOnCompletion({ ...orderData, status: 'PICKED_UP' });

            return NextResponse.json({ success: true });
        } else {
            await orderRef.update({
                'otp.attempts': FieldValue.increment(1)
            });
            return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 });
        }

    } catch (error: any) {
        console.error('OTP verification error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
