<p align="center">
  <img src="public/kanteen-logo.svg" width="56" alt="Kanteen" />
</p>

<h1 align="center">Kanteen</h1>

<p align="center">
  <strong>Campus canteen OS</strong> — online ordering, live kitchen, token pickup, and UPI payments.<br/>
  Built for a real college canteen (MRC), not a tutorial checkout demo.
</p>

<p align="center">
  <a href="https://kanteen-mrc-live.web.app">Live app</a>
  ·
  <a href="#how-an-order-works">How an order works</a>
  ·
  <a href="#razorpay--how-money-is-taken-safely">Razorpay security</a>
</p>

---

## Why this exists

College canteens get crushed at lunch. Students queue to pay, kitchen has no idea what is coming, and pickup is chaos.

Kanteen splits that into three jobs:

| Who | What they get |
|-----|----------------|
| **Students** | Google sign-in, menu, cart, UPI/card via Razorpay, a token + OTP, live “Preparing / Ready” board |
| **Kitchen / counter** | Incoming paid orders, status machine, thermal print queue, coupon (offline meal) entry, end-of-day cleanup |
| **Managers** | Menu, kitchen hours / maintenance switch, reports, student feedback |

Payments actually move money. Tokens are only issued **after** Razorpay confirms capture. The kitchen never cooks on a client-supplied price.

---

## Stack

| Layer | Choice |
|-------|--------|
| App | Next.js 16 (App Router), React 18, TypeScript (strict), Tailwind |
| Auth | Firebase Auth (Google for students, email/password + custom claims for staff) |
| Data | Cloud Firestore + security rules (RBAC). Privileged writes go through Firebase Admin on the server |
| Payments | Razorpay Orders API, Checkout.js, HMAC signatures, `payment.captured` webhook |
| Hosting | Firebase App Hosting (Cloud Run) behind `kanteen-mrc-live.web.app` |
| Extra | Web Push (VAPID), Genkit bottleneck helper for managers, thermal print job queue |

---

## How an order works

```
Student                  Kanteen API                 Razorpay              Kitchen
   |                          |                          |                    |
   |  Google sign-in          |                          |                    |
   |  browse /order           |                          |                    |
   |  POST /api/razorpay/     |                          |                    |
   |  create-order            |                          |                    |
   |  (Bearer ID token)       |                          |                    |
   |------------------------->|  lookup prices in menu   |                    |
   |                          |  create Razorpay order   |                    |
   |                          |------------------------->|                    |
   |                          |  store Firestore order   |                    |
   |                          |  status = pending        |                    |
   |  key_id + order_id       |                          |                    |
   |<-------------------------|                          |                    |
   |  Checkout.js modal       |                          |                    |
   |  UPI / card / netbanking |                          |                    |
   |----------------------------------------------------->|                    |
   |  payment_id + signature  |                          |                    |
   |  POST /api/razorpay/     |                          |                    |
   |  verify-payment          |  HMAC check              |                    |
   |------------------------->|  GET payment from Razorpay                    |
   |                          |------------------------->|                    |
   |                          |  amount, currency,       |                    |
   |                          |  captured, order match   |                    |
   |                          |  txn: token 201–999      |                    |
   |                          |  hash OTP, enqueue print |                    |
   |                          |  status = Preparing      |                    |
   |  token + OTP (once)      |                          |                    |
   |<-------------------------|                          |                  live
   |                          |                          |                  board
   |                          |     (backup) webhook     |                    |
   |                          |<----- payment.captured --|                    |
   |                          |  same finalize,          |                    |
   |                          |  idempotent              |                    |
   |                          |---------------------------------------------->|
   |                          |                          |     Ready → OTP    |
   |  pickup                  |                          |     PICKED_UP      |
```

### Student path

1. Sign in with Google (`/order` or `/student`). A Firestore `users/{uid}` profile is created on first login.
2. Add items. Parcel flags and totals shown in the cart are **estimates**; the server recomputes everything.
3. Checkout hits `POST /api/razorpay/create-order` with a Firebase ID token.
4. Razorpay Checkout opens (UPI intent, cards, netbanking). Only the **publishable** key is on the client.
5. On success, the browser sends `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature` to `POST /api/razorpay/verify-payment`.
6. If the student leaves during a UPI app-switch, a webhook and a pending-payment listener still try to attach the token so money is not “lost” in the UI.
7. Student sees a token and OTP. Kitchen sees the order on `/kitchen`. When it is Ready, they can get a push notification.
8. Pickup: staff verify OTP (`/api/staff/orders/{id}/verify-otp`), then mark `PICKED_UP`.

### Kitchen path

1. Staff sign in on `/staff-login` (role in Firebase custom claims: `kitchen_staff` / `kitchen_manager` / `admin`).
2. Paid orders appear as **Preparing**. Staff can only move status through the API state machine (`pending → Preparing → Ready → PICKED_UP`).
3. Print jobs are written by Admin SDK (not the browser) into `print_jobs`.
4. Offline coupon meals (`/api/staff/orders/manual`) skip Razorpay — they are prepaid paper coupons, amount ₹0.

### Manager path

Menu, `canteen_state` (hours, 24/7, “student ordering off”), reports, feedback list on `/counter` and `/report`.

---

## Razorpay — how money is taken safely

This is the part interviewers usually probe. The rule is: **the browser is hostile**. It can lie about price, quantity, and “I paid”.

### 1. Never trust the cart

`create-order` does **not** use `item.price` from the client.

- Loads each `itemId` from `menu_items`
- Rejects missing / inactive / unavailable items
- Caps qty, line price, and order total
- Recomputes parcel from **server** category rules
- Grosses up so the canteen nets the food total after Razorpay’s fee (`calculatePaymentBreakdown`)
- Creates a Razorpay **Order** for that amount in **paise**, INR
- Writes a Firestore order as `pending` with the Razorpay order id  
  Clients **cannot** `create` orders (`firestore.rules`: `allow create: if false`)

Key id / secret stay in server env (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`). The client only gets `NEXT_PUBLIC_RAZORPAY_KEY_ID`.

### 2. Checkout is just a wallet UI

Razorpay Checkout collects UPI/card. On success it returns a signature over `order_id|payment_id` using the **key secret**. That HMAC is verified with `crypto.timingSafeEqual` so a forged signature is not a timing leak.

### 3. Verify twice: signature, then the source of truth

`verify-payment` then **fetches the payment from Razorpay’s API**:

| Check | Why |
|-------|-----|
| HMAC of `order_id\|payment_id` | Request was not invented in DevTools |
| `payment.order_id` matches | Payment belongs to *this* Razorpay order |
| `payment.status === captured` | Authorized-but-not-captured is not “paid” |
| `currency === INR` | |
| `payment.amount === order.totalPrice * 100` | Stops paying ₹1 for a ₹200 cart |
| Firestore `studentId ===` verified UID | You cannot finalize someone else’s pending order |
| Stored `razorpayOrderId` matches | Pending row and Checkout are the same order |
| Idempotent if already `paid` | Double-click / retry does not mint two tokens |

All of that runs in a **Firestore transaction**: allocate the next token (201–999 for the day), set status to **Preparing**, store a **salted SHA-256 OTP hash**, enqueue print, audit log.

### 4. Webhook is the backup, not a backdoor

UPI often leaves the browser. Razorpay still fires `payment.captured`.

`POST /api/razorpay/webhook`:

- Requires `RAZORPAY_WEBHOOK_SECRET`
- Reads the **raw body**, HMAC-checks `x-razorpay-signature` (timing-safe)
- Rejects missing/invalid signatures (nobody can POST a fake “paid”)
- Dedupes on `webhook_events/{eventType}_{paymentId}`
- Fetches the payment again from Razorpay and runs the **same** finalize path

So: Checkout success *or* webhook can complete the order; neither skips amount checks.

### 5. What the client is not allowed to do

- Invent an order document
- Change `totalPrice` / `payment` from the kitchen app
- See other students’ PII on the public board (public API strips name/email)
- Call Razorpay with the key secret

Staff status changes go through `/api/staff/orders/...` with ID token + role (custom claims, allowlist fallback). Pickup OTP is verified server-side.

### 6. Extra rails

- Kitchen hours + maintenance flag on create-order (403 / 503)
- IP rate limits on create / verify (in-process; fine on one instance)
- Security headers + CSP (Razorpay Checkout origins allowed)
- Audit events: invalid signature, amount mismatch, webhook duplicate

---

## Repo map

```
src/app/
  (dashboards)/student/   Live board + menu
  order/                  Menu + checkout
  kitchen/ counter/ report/
  api/razorpay/           create-order, verify-payment, webhook
  api/staff/              status, OTP, manual coupon, reports
  api/print/              claim / complete print jobs
  feedback/               QR landing (Google → form)
src/lib/                  firebase-admin, crypto-utils, order-state-machine
firestore.rules           RBAC + “Admin SDK only” collections
tests/firestore-rules.test.ts
```

---

## Run locally

```bash
git clone https://github.com/dhrupad777/Kanteen.git
cd Kanteen
npm install
cp .env.example .env.local   # fill Firebase + Razorpay test keys
# Local Admin SDK: gcloud auth application-default login
npm run dev                  # http://localhost:3000
```

Use **Razorpay test keys** for development. Never commit `.env.local` or service-account JSON.

```bash
npm run typecheck
npm run build
```

Firestore rules tests need the emulator:

```bash
npx firebase emulators:start --only firestore
npx vitest run tests/firestore-rules.test.ts
```

---

## What I would talk about in an interview

- Why **Orders API + server amount** instead of client `amount` in Checkout
- Why **webhook + verify** both exist (UPI app switch)
- Why tokens are allocated in a **transaction**, not `Math.random`
- Why Firestore rules deny order **create** even for signed-in students
- Failure modes: signature fail, amount mismatch, already paid, kitchen closed

---

## Author

**Dhrupad Rajpurohit** — built and operated this for a live campus canteen.

- App: [kanteen-mrc-live.web.app](https://kanteen-mrc-live.web.app)
- Repo: [github.com/dhrupad777/Kanteen](https://github.com/dhrupad777/Kanteen)
