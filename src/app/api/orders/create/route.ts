import { NextResponse } from 'next/server';

// This route is disabled — all orders go through /api/razorpay/create-order
// which enforces payment before any order enters the system.

export async function POST() {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
