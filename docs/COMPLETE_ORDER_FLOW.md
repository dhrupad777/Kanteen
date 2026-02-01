# Complete Order Lifecycle Flow

> Detailed sequence from user action to physical fulfillment.

## System Actors
- **Student**: End user with mobile device
- **Client App**: Next.js Frontend
- **API**: Next.js Server Actions / API Routes
- **Firestore**: Database & Real-time Sync
- **Razorpay**: Payment Gateway
- **UPI / Bank**: External Payment Provider (GPay, PhonePe, etc.)
- **Manager**: Kitchen Staff Dashboard
- **Printer**: Print Queue Worker

---

## 1. Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    
    actor Student
    participant Client as Client App
    participant API
    participant FS as Firestore
    participant RP as Razorpay
    participant Bank as UPI / Bank App
    participant Mgr as Manager Dash
    participant Print as Printer Worker

    Note over Student, Bank: Phase 1: Creation & Payment

    Student->>Client: Click "Pay Now"
    Client->>API: POST /api/razorpay/create-order
    API->>FS: Validate Menu & Prices
    API->>FS: Create Order (status: pending)
    API->>RP: Orders.create({ amount, currency })
    RP-->>API: razorpay_order_id
    API-->>Client: { orderId, razorpayOrderId }

    Client->>RP: Razorpay.open(options)
    RP->>Student: Show Checkout Modal
    Student->>RP: Select UPI / App
    RP->>Bank: Request Payment
    Student->>Bank: Approve Payment (PIN)
    Bank-->>RP: Payment Success
    
    par Dual Confirmation Path
        RP-->>Client: Success Callback (signature)
        Client->>API: POST /api/razorpay/verify-payment
    and Async Webhook Fallback
        RP->>API: POST /webhook (payment.captured)
    end

    Note over API, Print: Phase 2: Verification & Fulfillment

    API->>RP: fetch(paymentId) (To confirm amount)
    API->>API: Verify Signature (HMAC-SHA256)
    
    rect rgb(240, 255, 240)
        Note right of API: Atomic Transaction
        API->>FS: Incremement Counter (Alloc Token)
        API->>FS: Generate OTP (Hash & Salt)
        API->>FS: Update Order (status: Preparing, paid: true)
        API->>FS: Create print_jobs/{orderId}
    end

    API-->>Client: { success: true, token, otp }
    Client->>Student: Show "Order Placed" screen (Token + OTP)

    Note over FS, Print: Phase 3: Kitchen Sync & Printing

    FS-->>Mgr: Real-time Listener (New "Preparing" Order)
    Mgr->>Mgr: Play Notification Sound
    
    Print->>FS: Poll / Listen print_jobs
    FS-->>Print: New Job found
    Print->>Print: Print Physical Ticket
    Print->>FS: Update Job (status: printed)

    Note over Student, Mgr: Phase 4: Pickup & Verification

    Student->>Mgr: Arrives at Counter (Shows Token + OTP)
    Mgr->>Mgr: Clicks "Verify OTP"
    Mgr->>API: POST /api/orders/{id}/verify-otp
    API->>FS: Fetch Order & Compare Hashes
    
    alt OTP Valid
        API->>FS: Update Order (status: PICKED_UP)
        FS-->>Mgr: Update UI (Green check)
        API-->>Mgr: Success
        Mgr->>Student: Hand over food
    else OTP Invalid
        API-->>Mgr: Error (Invalid OTP)
        Mgr->>Student: "Wrong OTP, try again"
    end
```

---

## 2. Key Process Details

### A. Token Allocation (Atomic)
To prevent duplicates when two students pay simultaneously:
1. **Transaction Start**
2. Read `order_counters/{date}`
3. `nextToken = current + 1`
4. Write new counter & Update Order with `token`
5. **Transaction Commit**
If any step fails (concurrency), the transaction retries automatically.

### B. Webhook vs Client Verification
We handle **both**:
1. **Client Verification**: Fast, immediate feedback for the user.
2. **Webhook**: Failsafe. If user interaction fails (browser closed, network lost after payment), the webhook ensures the order triggers the kitchen.
   - Idempotency logic ensures we don't process the same order twice.

### C. Kitchen Sync
The Manager Dashboard uses `onSnapshot` (Firestore real-time listener).
- **Latency**: < 1 second usually.
- **Reliability**: If dashboard goes offline and reconnects, it auto-syncs state.

### D. OTP Security
- **Generation**: Random 6-digit number.
- **Storage**: NEVER stored as plain text. Only `SHA256(otp + salt)` is in DB.
- **Verification**: Input OTP is hashed with stored salt and compared.
- **Expiry**: 30 minutes or 5 failed attempts.
