# Kanteen: The Next-Generation Cafeteria Operating System

> A complete, industry-grade online ordering and management platform built for modern campuses and cafeterias.

---

## 🛑 The Problem: Cafeteria Chaos

Traditional cafeterias suffer from several critical bottlenecks:
1. **Long Queues:** Students waste breaks standing in line to order and pay.
2. **Order Mismanagement:** Manual paper tokens get lost, leading to wrong pickups and food waste.
3. **Payment Delays:** Bank holidays delay settlements, hurting the cafeteria's working capital.
4. **Lack of Real-Time Sync:** Students don't know when their food is ready, crowding the counter.
5. **Security Loopholes:** Fake payment screenshots and stolen food due to lack of pickup verification.

---

## 💡 The Solution: Kanteen

**Kanteen** is a fully automated, real-time online ordering system. It connects hungry students with the kitchen seamlessly, handling everything from browsing the menu to secure payment, order tracking, and verified pickup.

### Key Value Propositions
- **Zero-Wait Ordering:** Order from anywhere on campus.
- **Role-Based Dashboards:** Distinct, optimized UI for Students and Kitchen Staff.
- **Smart Queue Management:** Automated, collision-free token generation.
- **AI-Powered Insights:** Genkit AI predicts kitchen bottlenecks before they happen.

---

## 🔄 The Lifecycle: End-to-End Order Process

The Kanteen order lifecycle is structured as a robust state machine to guarantee consistency:

1. **Browsing & Cart (Unauthenticated / Public):** 
   Students view today's live menu (synced in real-time) and add items to their cart.
2. **Checkout & Auth (Gated):**
   User is securely authenticated via Google. The server recalculates cart totals (never trusting client prices) to prevent tampering.
3. **Payment (`created` → `paid`):**
   Razorpay handles the transaction. The server verifies the payment signature securely, backed up by an idempotent webhook to guarantee no dropped orders even if the user closes their browser.
4. **Token Generation (Atomic Allocation):**
   Once paid, a server-side transaction atomically assigns a daily queue token (200-999) ensuring absolutely no duplicates, even under heavy load. A secure, 4-digit pickup OTP is generated and its *hash* is stored.
5. **Kitchen Preparation (`paid` → `preparing`):**
   The order pops up on the Kitchen Dashboard instantly. Staff clicks "Start" to acknowledge the order.
6. **Ready for Pickup (`preparing` → `ready`):**
   Staff marks the order as "Ready". The student's UI turns green and securely reveals their 4-digit OTP.
7. **Secure Handover (`ready` → `picked_up`):**
   The student provides the OTP at the counter. The kitchen enters it, the server verifies the hash, and the order is finalized. No stolen food!

---

## 🏗️ Why Kanteen is "Industry-Grade"

Kanteen is not a toy project; it is architected to handle scale, malicious actors, and network failures.

*   **Zero-Trust Architecture:** Client-side prices are completely ignored. The Next.js server acts as the absolute source of truth, recalculating totals from the Firestore catalog before creating payment links.
*   **Idempotent Webhooks:** Network dropped after payment? The Razorpay webhook silently captures the payment on the backend, verifies the signature, and advances the order state.
*   **Atomic Transactions:** Generating token numbers uses Firestore Transactions to prevent race conditions. If 50 students pay at the exact same millisecond, they will all receive unique token numbers seamlessly.
*   **Cryptographic OTP Security:** The pickup OTP is never stored in plaintext in the database. It is hashed using a secure algorithm (like SHA-256), meaning even database administrators cannot steal a student's food.
*   **Role-Based Access Control (RBAC):** Strict Firestore Security Rules ensure students can only read their own orders, and only authorized kitchen staff can update order statuses.

---

## 💳 Enterprise Payment Strategy

Kanteen uses a strategic implementation of **Razorpay Instant Settlements**.

*   **Bypassing Bank Holidays:** Standard T+2 settlements freeze on weekends. Kanteen leverages on-demand settlements, meaning money hits the cafeteria's bank account within 10 seconds of a student paying, 24/7/365.
*   **Convenience Fee Model:** The platform automatically calculates the ~2.5% gateway/settlement fee and adds it to the checkout total seamlessly, allowing the cafeteria to operate at a 0% commission loss while students enjoy the convenience of online ordering.

---

## 💻 The Tech Stack

Built on a modern, highly scalable foundation:
*   **Frontend & Backend:** Next.js 16 (App Router)
*   **Database & Auth:** Firebase Firestore & Firebase Authentication
*   **Payments:** Razorpay API & Webhooks
*   **Artificial Intelligence:** Google Genkit AI 
*   **Styling & UI:** Tailwind CSS, Radix UI, shadcn/ui, Framer Motion

*Kanteen isn't just an app; it's a scalable digital infrastructure for modern dining.*
