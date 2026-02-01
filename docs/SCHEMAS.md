# Schema Reference

> Document schemas for orders, print_jobs, and related collections.

---

## Orders Collection

```typescript
// Collection: orders/{orderId}
interface Order {
    // === Identity ===
    id: string;                    // Firestore doc ID
    studentId: string;             // Firebase UID
    userName?: string;             // Display name
    userEmail?: string;            // Email

    // === Order Details ===
    items: Array<{
        itemId: string;
        name: string;
        quantity: number;
        price: number;             // Unit price in INR
    }>;
    totalPrice: number;            // Sum in INR
    isParcel: boolean;
    platformCharges?: number;

    // === Status ===
    status: 'pending' | 'Preparing' | 'Ready' | 'PICKED_UP' | 'EXPIRED' | 'CANCELLED';
    token: number;                 // 201-999 for online, 001-200 for offline
    dateKey: string;               // YYYY-MM-DD

    // === Payment (immutable after capture) ===
    payment: {
        razorpayOrderId: string;
        razorpayPaymentId?: string;
        razorpaySignature?: string;
        status: 'created' | 'paid' | 'failed';
        amount?: number;           // In paise (immutable after payment)
        currency?: string;         // 'INR' (immutable after payment)
        paidAt?: Timestamp;
    };

    // === OTP (server-managed) ===
    otpHash: string;               // SHA-256(otp + salt)
    otpSalt: string;               // Random 16-byte hex
    otpExpiresAt: Timestamp;       // 30 minutes from creation
    otpAttempts: number;           // Max 5
    otpLockedUntil?: Timestamp;    // 10-minute lockout

    // === Kitchen Tracking ===
    kitchen?: {
        markedPreparingAt?: Timestamp;
        readyAt?: Timestamp;
        pickedUpAt?: Timestamp;
        updatedBy?: string;        // Staff UID
    };

    // === Audit ===
    audit: {
        createdAt: Timestamp;
        updatedAt: Timestamp;
        updatedBy: string;
    };
    createdAt: Timestamp;
}
```

---

## Print Jobs Collection

```typescript
// Collection: print_jobs/{orderId}
// Note: jobId = orderId for idempotency (exactly-once guarantee)
interface PrintJob {
    // === Job Identity ===
    // Document ID is orderId (guarantees one job per order)

    // === Status ===
    status: 'queued' | 'printing' | 'completed' | 'failed' | 'dead_letter';
    attempts: number;              // Current attempt count
    maxAttempts: number;           // Default: 5

    // === Payload (minimal, no PII) ===
    payload: {
        orderId: string;
        token: number;
        items: Array<{ name: string; qty: number }>;
        studentName?: string;      // Optional display name only
        isParcel: boolean;
        createdAt: string;         // ISO timestamp
    };
    payloadHash: string;           // SHA-256 for integrity verification

    // === Timing ===
    createdAt: Timestamp;
    lastAttemptAt?: Timestamp;
    completedAt?: Timestamp;

    // === Worker Info ===
    printerId?: string;            // Which printer processed
    error?: string;                // Last error message
}
```

---

## Audit Logs Collection

```typescript
// Collection: audit_logs/{logId}
interface AuditLog {
    eventType: 
        | 'ORDER_CREATED'
        | 'PAYMENT_VERIFIED'
        | 'PAYMENT_FAILED'
        | 'WEBHOOK_PROCESSED'
        | 'WEBHOOK_DUPLICATE'
        | 'STATUS_CHANGED'
        | 'OTP_VERIFIED'
        | 'OTP_FAILED'
        | 'OTP_REGENERATED'
        | 'OTP_LOCKED'
        | 'INVALID_TRANSITION'
        | 'AMOUNT_MISMATCH'
        | 'SIGNATURE_INVALID';

    actorId: string;               // Firebase UID
    actorRole?: string;            // 'student' | 'kitchen_staff' | 'admin'
    orderId?: string;

    ip: string;
    userAgent: string;

    details?: Record<string, any>; // Event-specific data
    timestamp: Timestamp;
}
```

---

## Webhook Events Collection

```typescript
// Collection: webhook_events/{eventId}
// Used for deduplication
interface WebhookEvent {
    eventId: string;               // Razorpay event_id
    eventType: string;             // e.g., 'payment.captured'
    orderId: string;
    processedAt: Timestamp;
}
```

---

## Order Counters Collection

```typescript
// Collection: order_counters/{canteenId_YYYYMMDD}
interface OrderCounter {
    dayKey: string;                // YYYY-MM-DD
    nextOnlineToken: number;       // 201-999
    nextOfflineToken?: number;     // 001-200
    updatedAt: Timestamp;
}
```

---

## Firestore Rules Reference

See [firestore.rules](file:///c:/Kanteen-1/firestore.rules) for complete rules.

Key field restrictions for orders:

```javascript
// Staff can ONLY update these fields:
['status', 'kitchen', 'otp', 'audit']

// These fields are IMMUTABLE after creation:
['items', 'totalPrice', 'studentId', 'payment.amount', 'payment.currency', 'token']
```
