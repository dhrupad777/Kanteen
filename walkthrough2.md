# Kanteen Online Ordering — Production Walkthrough (Next.js + Firebase + Razorpay)

This file is your **single source of truth** for building the “Order Online” system end-to-end in a production-grade way.
It is written to be followed inside your IDE step-by-step, with **explicit checks after each section**.

> Scope: This covers the *online ordering flow* only.
> Your existing “menu prepared today” system and student dashboard remain public (no forced auth).
> Authentication happens when the user enters the `/order` flow.

---

## 0) Non-negotiables (read once)

### What must be true in production
- **Never** mark an order as paid based on client-side success alone.
- Token allocation (200–999) must be **atomic** (no duplicates) using a server transaction.
- OTP must be generated **server-side** and stored as a **hash**, not plaintext.
- Kitchen should consume orders from Firestore in real-time; students should see real-time status.
- Every status change is **audited** (who did it, when).

### Terminology used in this doc
- **Token**: the pickup number students say at the counter (online = 200–999).
- **Order ID**: Firestore doc id (internal identity, never reused).
- **OTP**: 4-digit pickup code (displayed only when order becomes READY).

---

## 1) Repo structure you should end up with (high-level)

### Pages / Routes (Next.js App Router)
- `app/(student)/student/page.tsx`  
  Public student dashboard (menu + order status widgets, no auth gate)
- `app/order/page.tsx`  
  Cart + checkout entry page (auth gate begins here)
- `app/order/success/page.tsx` *(optional)*  
  Payment success redirect landing (then routes to student dashboard)
- `app/kitchen/page.tsx`  
  Kitchen dashboard (role-gated)
- `app/api/razorpay/create-order/route.ts`  
  Server endpoint to create Razorpay order
- `app/api/razorpay/verify-payment/route.ts`  
  Server endpoint to verify payment signature & finalize Firestore order
- `app/api/razorpay/webhook/route.ts`  
  Razorpay webhook (backup truth-source)
- `app/api/orders/verify-otp/route.ts`  
  Server endpoint for kitchen OTP verification (changes status to PICKED_UP)

### Shared modules
- `src/lib/firebase.ts` (client SDK init)
- `src/lib/firebase-admin.ts` (server admin init, used in API routes)
- `src/types/order.ts` + `src/types/menu.ts`
- `src/contexts/auth-provider.tsx` (optional auth for UI)
- `src/components/order/*` (cart, checkout, order summary UI)
- `src/components/kitchen/*` (order list, status actions, otp verify UI)

**Check (Section 1)**
- [ ] You can locate (or create) these paths in your IDE.
- [ ] You are using the **App Router** (Next.js `/app`).
- [ ] You have a place for server routes under `app/api/*`.

---

## 2) Firebase Console setup (do this before coding)

### 2.1 Create/confirm Firebase project
- Firebase Console → create/select project: `Kanteen`
- Enable **Firestore Database**
- Enable **Authentication → Google**
- Confirm **Billing** is enabled if you will use webhooks/functions/hosting at scale.

### 2.2 Firestore Collections (final)
Create these collections (documents will be created by code; you can add one sample manually to validate schema).

#### A) `canteen_state/today` (already exists)
Public read. Contains:
- prepared menu sections (breakfast/main/snacks/special/note)
- section visibility flags (optional)

#### B) `menu_items` (catalog of orderable items)
Each doc:
- `name: string`
- `price: number` (in INR paise or rupees — choose one and stick to it)
- `category: "breakfast" | "snack" | "main" | "special"`
- `isAvailable: boolean`
- `imageUrl?: string` (optional later)

> Best practice: store money as **paise** (integer) to avoid float issues.

#### C) `orders` (source of truth)
Each doc (minimum production fields):
- `campusId: string` (even if single campus now, use `"default"`)
- `userId: string`
- `userName: string`
- `userPhotoURL: string`
- `items: array` of snapshots: `{ itemId, name, qty, pricePaise }`
- `amountPaise: number`
- `token: { number: number, dayKey: string }`
- `otp: { hash: string }`
- `status: "created" | "paid" | "preparing" | "ready" | "picked_up" | "cancelled"`
- `payment: { provider: "razorpay", razorpayOrderId, razorpayPaymentId?, razorpaySignature?, status: "created"|"paid"|"failed", paidAt? }`
- `audit: { createdAt, updatedAt, createdBy, updatedBy }`

#### D) `counters`
Doc id pattern: `{campusId}_{YYYY-MM-DD}`
Fields:
- `nextOnlineToken: number` (starts at 200)
- `dayKey: string` (YYYY-MM-DD, Asia/Kolkata)
- `updatedAt: timestamp`

#### E) `users/{uid}` (profile)
- `name: string`
- `photoURL: string`
- `email: string`
- `updatedAt: timestamp`

**Check (Section 2)**
- [ ] Firestore shows collections: `canteen_state`, `menu_items`, `orders`, `counters`, `users`.
- [ ] You understand: `orders` docId is NOT the token number.
- [ ] You will use **token range 200–999** for online.

---

## 3) Security Rules (production baseline)

### 3.1 What must be public
- Students can read today’s menu: `canteen_state/today`
- Students **cannot** read all orders globally

### 3.2 Rules intent (high-level)
- `canteen_state/today`: allow read to everyone; write only to admin/manager roles
- `menu_items`: allow read to everyone; write only to admin
- `users/{uid}`: user can read/write only their own doc
- `orders/{orderId}`:
  - a user can read only if `request.auth.uid == resource.data.userId`
  - kitchen role can read active orders and update status
  - OTP verification should happen via server endpoint (recommended) not direct write

### 3.3 Role model (recommended minimal)
Use Firebase Auth custom claims or a Firestore `roles/{uid}` doc.
For MVP, simplest:
- `roles/{uid}` with `{ role: "kitchen" | "admin" }`
- Rules check that role for kitchen dashboard access.

**Check (Section 3)**
- [ ] Unauthenticated user can read `canteen_state/today`.
- [ ] Unauthenticated user cannot query `orders`.
- [ ] A signed-in user can read only their own `orders`.
- [ ] Kitchen accounts are restricted to their dashboard routes and Firestore reads.

---

## 4) Razorpay setup (production)

### 4.1 Create Razorpay account + API keys
- Razorpay Dashboard → Settings → API Keys
- Generate **Key ID** and **Key Secret**
- Store secrets **server-side only**:
  - `.env.local` (dev)
  - Hosting secrets / environment config (prod)

### 4.2 Configure webhook (strongly recommended)
- Razorpay Dashboard → Webhooks
- Webhook URL: `https://<your-domain>/api/razorpay/webhook`
- Events (minimum):
  - `payment.captured`
  - `payment.failed`
  - (optional) `order.paid`

Store webhook secret in server env.

### 4.3 Payment truth source
Use **both**:
- client redirect verification (`verify-payment`) for fast UX
- webhook for reliability (handles closed tabs / network issues)

**Check (Section 4)**
- [ ] You have Key ID & Secret stored in server env only.
- [ ] Webhook configured and points to your deployed URL.
- [ ] Webhook secret stored in env.

---

## 5) Order lifecycle (state machine)

### States
- `created` → user created a cart & server created Razorpay order id
- `paid` → signature verified and/or webhook confirmed payment
- `preparing` → kitchen acknowledged
- `ready` → kitchen marked ready (OTP becomes visible to student UI)
- `picked_up` → kitchen verified OTP and handed over food
- `cancelled` → optional

### Status transitions allowed
- Student flow:
  - `created` → `paid` (server only)
- Kitchen flow:
  - `paid` → `preparing`
  - `preparing` → `ready`
  - `ready` → `picked_up` (OTP verify endpoint)
- Admin flow (optional):
  - `paid|preparing|ready` → `cancelled`

**Check (Section 5)**
- [ ] You will never allow the client to directly set `paid`.
- [ ] Only kitchen/admin can set `preparing/ready/picked_up`.

---

## 6) Token allocation (200–999) and daily reset

### Your requirements (final)
- Online token range: **200 to 999**
- Unique per day (no duplicates)
- Resets daily (Asia/Kolkata)
- If token reaches 999:
  - MVP behavior: stop accepting new online orders for that day

### Implementation plan (server-side)
- Compute `dayKey` as `YYYY-MM-DD` in Asia/Kolkata
- Use counter doc: `counters/{campusId}_{dayKey}`
- Use a transaction:
  1) read `nextOnlineToken` (default 200 if doc missing)
  2) if > 999 → reject new order (“Online orders full today”)
  3) assign token = nextOnlineToken
  4) write back `nextOnlineToken = token + 1`
  5) write token into `orders/{orderId}.token`

### Compatibility with existing “status checking 1–300”
You said you already have order number status checking built for **1–300**.
For production, do this:
- Keep offline tokens 1–199 (or 1–200 if you insist)
- Online tokens 200–999
- Update the status-checking UI to support up to 999:
  - accept input up to 999
  - query by `token.number` + `token.dayKey` (critical) to avoid cross-day confusion
  - if your existing system does not have `dayKey`, add it now (best practice)

**Check (Section 6)**
- [ ] Counter doc created per day automatically (new doc each day).
- [ ] Token is assigned **only** after payment is verified.
- [ ] Status checking UI supports token up to 999 and includes dayKey.

---

## 7) OTP strategy (generate now, reveal later)

### Your requirement
- OTP generated at payment finalization time (so it exists early)
- OTP displayed only when order becomes READY (green state)

### Production baseline
- OTP is 4-digit for usability
- Generate server-side using a secure random generator
- Store only `otp.hash` (e.g., SHA-256 with salt)
- Never store OTP plaintext in Firestore
- Reveal OTP in UI only when `status == "ready"`

### Kitchen verification
Kitchen enters OTP in the order UI → server verifies:
- if match: set `status="picked_up"` and set timestamps
- if mismatch: record `attempts` (even if you don’t lock now, log it)

**Check (Section 7)**
- [ ] OTP is never written to Firestore as plaintext.
- [ ] OTP never appears in logs.
- [ ] Student can’t see OTP until READY.

---

## 8) UX plan (student)

### 8.1 `/student` dashboard (public)
- Always renders menu and “Order Online” button
- If user is not signed in:
  - show “Guest” (no modal)
- If user is signed in (after ordering):
  - show name + Google photo
  - show “Current Order” section if there is an active order

### 8.2 `/order` page (auth begins here)
Flow:
1) if not signed in → Google sign-in prompt
2) if signed in but user profile missing `users/{uid}.name` → ask name once
3) show menu items (from `menu_items`) + cart
4) checkout → Razorpay

### 8.3 After payment
- On Razorpay success redirect back to your app (either `/order/success` or `/student`)
- UI shows “Current Order” section:
  - BLUE when status `paid/preparing`
  - GREEN when status `ready` (reveals OTP at bottom)
  - on picked up: show “Completed” or hide after a short time

### 8.4 Multiple orders by same user
- Show a small list: “Your Active Orders”
- Each shows token number, status, and expandable order summary

**Check (Section 8)**
- [ ] Student can view menu without login.
- [ ] Student is only asked to sign in when they press “Order Online”.
- [ ] After first order, dashboard shows name/photo.
- [ ] “Current Order” updates in real-time.

---

## 9) UX plan (kitchen)

### Kitchen dashboard goals
- No clutter, fast actions
- Real-time orders
- Clear token number + items + status

### Layout
- Columns or tabs by status:
  - NEW/PAID
  - PREPARING
  - READY
- Each order card:
  - token number (largest text)
  - name + photo (helps reduce wrong pickup)
  - compact item list
  - created time
- Actions:
  - “Start” → preparing
  - “Ready” → ready (triggers OTP reveal in student UI)
  - “Verify OTP” → opens input, confirms pickup

### OTP verification
- Kitchen enters OTP
- On success:
  - status becomes picked_up
  - card disappears from active columns

**Check (Section 9)**
- [ ] Kitchen sees orders appear within 1–2 seconds after payment verification.
- [ ] Kitchen can move order across statuses.
- [ ] OTP verification completes and removes order from active list.

---

## 10) Server responsibilities (Next.js API routes)

### 10.1 Create Razorpay order
- Validates cart payload on server
- Computes final amount on server (trust server prices)
- Creates Razorpay order
- Writes Firestore `orders` doc with:
  - status `created`
  - payment.status `created`
  - items snapshot
  - amount

### 10.2 Verify payment (signature verification)
- Receives: `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`
- Verifies signature using Razorpay secret
- If valid:
  - mark `payment.status = paid`
  - assign token (transaction)
  - generate OTP hash
  - set `status = paid`
- Redirect/return orderId so UI can subscribe

### 10.3 Webhook (backup)
- Validates webhook signature
- If payment captured and order not marked paid:
  - finalize order exactly like verify-payment does
- Must be idempotent (same event may arrive multiple times)

### 10.4 Verify OTP (kitchen)
- Accepts `orderId` + OTP input
- Compares OTP hash
- If match:
  - set status picked_up and timestamps
- Logs attempts

**Check (Section 10)**
- [ ] Amount is computed server-side from `menu_items` prices.
- [ ] Payment verification is idempotent.
- [ ] Token allocation occurs only in server route, never client.

---

## 11) Firestore indexing & queries (production)

### Queries you will do
Student:
- “active orders for my uid for today”
  - filter by `userId`
  - filter by `token.dayKey == today`
  - filter status in (`paid`, `preparing`, `ready`)
Kitchen:
- active orders for today
  - filter by `token.dayKey == today`
  - filter status in (`paid`, `preparing`, `ready`)
- optionally sort by `createdAt`

Create composite indexes as Firestore asks (do it immediately; don’t ignore warnings).

**Check (Section 11)**
- [ ] No query uses `!=` without an index plan.
- [ ] You created required indexes from Firebase console prompts.

---

## 12) Deployment plan (production)

### Environment variables (server)
- Razorpay:
  - `RAZORPAY_KEY_ID`
  - `RAZORPAY_KEY_SECRET`
  - `RAZORPAY_WEBHOOK_SECRET`
- Firebase Admin:
  - service account or application default credentials configuration (depending on hosting)

### Hosting
- Use one deployment platform consistently:
  - Firebase App Hosting OR Firebase Hosting with SSR functions OR Vercel
- Ensure server routes run in a trusted environment (secrets available).

### Logging
- Log order state transitions (orderId, token number, status, updatedBy)
- Never log OTP or payment secrets.

**Check (Section 12)**
- [ ] Secrets exist only in server environment.
- [ ] Production URL is set in Razorpay webhook.
- [ ] You tested payment flow in Razorpay Test Mode first.

---

## 13) End-to-end test plan (do this before “go live”)

### Test 1: Public student dashboard
- Open `/student` in incognito
- Confirm: menu loads, no auth prompt, Order Online button visible

### Test 2: Order flow
- Click “Order Online”
- Confirm: Google sign-in happens here (not on student dashboard)
- Add 2 items to cart
- Checkout in Razorpay test mode
- Confirm redirect back

### Test 3: Post-payment order
- Student sees:
  - token number in 200–999
  - blue status (paid/preparing)
  - order summary
- Confirm Firestore `orders` doc has:
  - payment.status = paid
  - token.dayKey matches today
  - otp.hash exists

### Test 4: Kitchen flow
- Kitchen dashboard shows the order under NEW/PAID
- Click Start → goes to PREPARING
- Click Ready → goes to READY
- Student UI turns green and reveals OTP

### Test 5: Pickup verification
- Kitchen enters wrong OTP:
  - should fail (do not change status)
- Kitchen enters correct OTP:
  - status becomes PICKED_UP
  - student sees completion
  - kitchen list removes it

### Test 6: Token increment
- Place 3 orders:
  - tokens should increment: 200, 201, 202…

### Test 7: Daily reset
- Temporarily simulate dayKey change (or manually create new counter doc):
  - token returns to 200 next day

**Check (Section 13)**
- [ ] All tests pass without manual Firestore edits.
- [ ] Kitchen never sees duplicate tokens in same day.
- [ ] Students only see their own orders.

---

## 14) What NOT to do (to avoid future rewrites)

- Don’t use token number as Firestore doc id.
- Don’t store OTP plaintext anywhere.
- Don’t trust client price totals; always recompute on server from `menu_items`.
- Don’t finalize payment without signature verification + webhook backup.
- Don’t build kitchen updates as client-only writes without role checks.

---

## 15) “Definition of Done” checklist (print this)

- [ ] `/student` is public and stable.
- [ ] `/order` is the only place where auth is required.
- [ ] Cart uses Firestore `menu_items` catalog.
- [ ] Razorpay payment is server-verified.
- [ ] Token is assigned atomically (200–999) and stored with dayKey.
- [ ] OTP is generated server-side, stored hashed, revealed only when READY.
- [ ] Kitchen dashboard is role-gated and can move statuses.
- [ ] OTP verification endpoint marks PICKED_UP and prevents double pickup.
- [ ] Firestore rules block unauthorized reads/writes.
- [ ] Webhook is configured and idempotent.
- [ ] Status-check UI supports up to 999 and uses dayKey.

---

## Notes specific to your current system
You already have “order number status checking” in the platform for 1–300.
When you expand to 200–999:
- keep your status UI component but expand validation and queries
- ensure your status queries include **today’s dayKey** to avoid showing yesterday’s order with same token number

---

**Next action for you in the IDE**
Start with Sections **2 → 4** (Firebase + Razorpay console setup), then build server routes (Section 10), then UI (Sections 8–9), then run the end-to-end tests (Section 13).
