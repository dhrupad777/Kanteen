# Razorpay Strategy & Pricing Guide for Kanteen

## 1. Faster & Holiday-Proof Settlements (Instant Settlements)
Currently, standard settlements (T+2) take time and are halted during bank holidays (like Sundays). If you and your students do not mind the Razorpay 2% transaction fee and want money immediately, you should enable **Razorpay Instant Settlements**.

### Available Options:
1. **Same-Day Settlements (T+0):** Settles funds automatically multiple times throughout the same day. 
   - **Cost:** An additional fee of ~0.15% to 0.20% per transaction (deducted from the total, making it ~2.2% total).
2. **On-Demand Settlements:** Settles funds manually or automatically within 10 seconds of clicking transfer, 24x7x365. It bypasses bank holidays.
   - **Cost:** An additional fee of ~0.20% to 0.30% per transaction (making it ~2.3% total).

### How to Avail It:
1. Login to your **Razorpay Dashboard**.
2. Navigate to **Settlements** from the left-hand navigation pane.
3. Depending on your Razorpay account's health and duration, you should see an option to turn on **Instant Settlements** or **Early Settlements**. 
4. Read the fee terms and enable it.

---

## 2. Does Razorpay Have a Fixed-Fee / 0% Commission Plan?
**No. Razorpay does not offer a standard "fixed monthly subscription" (like paying ₹5,000/month for 0% commission) for average small-to-medium payment gateway merchants.**

Their "Zero MDR" marketing often confuses people: The Indian government mandates that bank-to-bank UPI transfers have 0% MDR (no commission). However, Razorpay charges a **2% Platform Fee** for providing the technology, software, dashboard, and webhook alerts to make your web app work smoothly.

- **Enterprise Plan:** They only offer a "Custom Pricing Model" if you consistently process millions or crores of rupees in volume per month. In that case, you negotiate directly with their sales team, and they reduce your percentage fee drastically (e.g., to 0.5% or 1%). However, they never completely eliminate the percentage via a flat-fee subscription for standard gateways.
- **Alternative:** If you want absolute 0% commission with no platform fee, you would need to use a bank-provided physical dynamic QR code system (like Kotak or HDFC Merchant apps), but integrating those securely into an automated website checkout flow like Kanteen is exceptionally difficult.

---

## 3. Applying This to Your Exact Codebase Usecase
Kanteen currently runs entirely on your website, where the backend validates prices, creates a Razorpay order, and generates a popup for the student to pay. 

Since you mentioned **"if consumers and students don't mind paying the 2%"**, it means you want to pass the Razorpay transaction fee onto the students as a convenience fee, so **you** get the exact food amount settled in your bank account immediately.

### How to Build This In Kanteen
In your frontend `src/app/order/page.tsx` line 167, you check out the user:

```typescript
// c:\Kanteen-1\src\app\order\page.tsx 
const checkoutItems = getCheckoutItems();

// You calculate the 2% Razorpay fee + 18% GST on the fee + 0.3% Instant Settlement fee.
// Total expected fee: roughly 2.36%. For safety, you might apply a flat 2.5% convenience charge.
const totalOrderAmount = checkoutItems.reduce((acc, item) => acc + (item.price * item.qty), 0);
const gatewayFee = Math.ceil(totalOrderAmount * 0.025); // 2.5% convenience fee

await razorpayCheckout({
    items: checkoutItems,
    isParcel: false,
    platformCharges: gatewayFee, // <-- Change this from 0 to 'gatewayFee'
});
```

Because of your brilliant existing backend infrastructure in `src/app/api/razorpay/create-order/route.ts`...

```typescript
// c:\Kanteen-1\src\app\api\razorpay\create-order\route.ts (Line 117)
// Add platform charges
serverCalculatedTotal += platformCharges;
```

...your backend **already seamlessly accepts and adds the `platformCharges`** to the Razorpay checkout `amountPaise`.

**Result:**
If a student buys a Dosa for ₹100, they will be prompted to pay ₹102.50.
Razorpay takes its ~₹2.36 fee (Standard + Instant Settlement) from the transaction.
The remaining ₹100.14 settles into your **bank account within 10 seconds**, completely bypassing holidays, and the student absorbs the cost!
