# Production Deployment Checklist

## Pre-Deployment (Do Now)

### 1. Razorpay Dashboard Configuration

Go to [Razorpay Dashboard](https://dashboard.razorpay.com) and configure:

- [ ] **Add New Domain**
  - Navigate to: Settings → Website & App Settings
  - Add: `https://kanteen-mrc-live.web.app`
  - Wait for approval (usually 1-2 business days)

- [ ] **Configure Webhook**
  - Navigate to: Settings → Webhooks
  - Click "Add New Webhook"
  - Webhook URL: `https://studio--studio-1083756985-9d2c6.us-central1.hosted.app/api/razorpay/webhook`
  - Secret: Copy the value from `apphosting.yaml` → `RAZORPAY_WEBHOOK_SECRET`
  - Active Events:
    - [x] `payment.captured`
    - [x] `payment.failed`
  - Click "Create Webhook"

- [ ] **Verify UPI VPA**
  - Navigate to: Account & Settings → Bank Account
  - Confirm UPI VPA `Paytmqr698fb7@ptys` is linked
  - Verify bank account is verified

### 2. Firebase Console Setup

Go to [Firebase Console](https://console.firebase.google.com/project/studio-1083756985-9d2c6):

- [ ] **Deploy Firestore Indexes**
  ```bash
  npx firebase deploy --only firestore:indexes
  ```

- [ ] **Add Manager to Allowlist**
  - Navigate to: Firestore → Data → `manager_allowlist`
  - Add documents for staff emails:
    ```json
    {
      "email": "staff@yourdomain.com",
      "enabled": true
    }
    ```

- [ ] **Set Custom Claims (Optional - RBAC)**
  ```bash
  npx ts-node scripts/set-custom-claims.ts
  ```

### 3. Test Mode Verification

While waiting for domain approval, test with Razorpay Test Keys:

1. Create `.env.local.test` with test keys:
   ```env
   RAZORPAY_KEY_ID=rzp_test_xxxxxx
   RAZORPAY_KEY_SECRET=xxxxx
   NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxxx
   ```

2. Run the test order flow:
   ```bash
   npx ts-node scripts/test-order-flow.ts
   ```

---

## Post-Approval (When Domain is Approved)

### 1. Verify Payment Flow

- [ ] Make a test payment of ₹1
- [ ] Verify token is assigned (201-999 range)
- [ ] Verify OTP is displayed on success page
- [ ] Verify OTP is stored in localStorage
- [ ] Check order appears in staff dashboard

### 2. Verify OTP Verification

- [ ] Staff can enter OTP
- [ ] Correct OTP marks order as PICKED_UP
- [ ] Wrong OTP increments attempt counter
- [ ] 5 wrong attempts locks the order
- [ ] Student can regenerate OTP

### 3. Verify Webhook Fallback

- [ ] Simulate client disconnect after payment
- [ ] Verify webhook processes the payment
- [ ] Order still gets token and transitions to Preparing

### 4. Verify Real-time Sync

- [ ] Open student dashboard on phone
- [ ] Open staff dashboard on computer
- [ ] Mark order as Ready on staff dashboard
- [ ] Verify student dashboard updates in <2 seconds

---

## Monitoring Setup

### 1. Firebase Console Alerts

- [ ] Set up Firestore usage alerts
- [ ] Set up Cloud Run error alerts
- [ ] Set up billing alerts

### 2. Razorpay Alerts

- [ ] Enable payment failure notifications
- [ ] Enable refund notifications
- [ ] Enable daily settlement reports

---

## Rollback Plan

If issues occur after deployment:

1. **Revert to old domain:**
   ```bash
   # Update firebase.json hosting.site to old value
   npx firebase deploy --only hosting
   ```

2. **Disable new domain in Razorpay:**
   - Remove from Settings → Website & App Settings

3. **Check logs:**
   ```bash
   gcloud run services logs read studio --region=us-central1 --limit=100
   ```

---

## Support Contacts

- **Razorpay Support:** support@razorpay.com
- **Firebase Support:** https://firebase.google.com/support
- **Emergency:** Check audit_logs collection for recent events

---

## Quick Reference

| Service | URL |
|---------|-----|
| Frontend | https://kanteen-mrc-live.web.app |
| Backend API | https://studio--studio-1083756985-9d2c6.us-central1.hosted.app |
| Firebase Console | https://console.firebase.google.com/project/studio-1083756985-9d2c6 |
| Razorpay Dashboard | https://dashboard.razorpay.com |
| Cloud Run Logs | https://console.cloud.google.com/run?project=studio-1083756985-9d2c6 |
