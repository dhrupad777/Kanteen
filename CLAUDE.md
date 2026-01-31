# Kanteen - Project Reference

## Overview
Kanteen is a canteen/cafeteria order management system built with Next.js 16, Firebase, and Genkit AI. It provides role-based dashboards for students and canteen staff with real-time order tracking.

## Tech Stack
- **Framework**: Next.js 16 (App Router, Turbopack for dev)
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Payments**: Razorpay
- **AI**: Genkit with Google AI
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI + shadcn/ui
- **Forms**: React Hook Form + Zod validation
- **Charts**: Recharts

## Project Structure
```
src/
├── app/                    # Next.js App Router pages
│   ├── (dashboards)/       # Role-based dashboards
│   │   ├── staff/          # Staff dashboard & kitchen view
│   │   └── student/        # Student dashboard
│   ├── cart/               # Shopping cart
│   ├── login/              # Authentication
│   ├── manager/            # Manager dashboard
│   ├── onboarding/         # User onboarding
│   └── order/              # Order pages
├── ai/                     # Genkit AI flows
│   └── flows/              # AI flow definitions (bottleneck prediction)
├── components/             # React components
│   └── ui/                 # shadcn/ui components
├── hooks/                  # Custom React hooks (use-auth, use-toast)
└── lib/                    # Utility functions
```

## Key Commands
```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build (Webpack)
npm run start        # Start production server
npm run lint         # Run ESLint
npm run typecheck    # TypeScript type checking
npm run genkit:dev   # Start Genkit AI dev server
```

## Core Features
- **Order Tracking**: Real-time order status updates
- **Role-Based Dashboards**: Separate views for students and staff
- **Push Notifications**: Browser notifications when orders are ready
- **Bottleneck Prediction**: AI-powered suggestions for kitchen efficiency

## Style Guidelines
- Primary Orange: #FF8C00
- Background: #FFF2E5
- Accent Red-Orange: #FF4500
- Fonts: Poppins (headlines), Inter (body)
- Icons: Simple outline style
- Layout: Card-based, clean design

## Firebase Configuration
- Project uses Firebase Firestore for data persistence
- Firebase Auth for user authentication
- Configuration in environment variables

## Razorpay Payment Integration
- **API Routes**: `src/app/api/razorpay/`
  - `create-order/` - Creates Razorpay order & Firestore pending order
  - `verify-payment/` - Verifies signature, assigns token, generates OTP
  - `webhook/` - Backup verification for payment.captured events
- **Hook**: `src/hooks/use-razorpay.ts` - Client-side checkout flow
- **Types**: `src/types/order.ts` - Order and payment types
- **Environment Variables**:
  - `RAZORPAY_KEY_ID` - Server-side key
  - `RAZORPAY_KEY_SECRET` - Server-side secret
  - `NEXT_PUBLIC_RAZORPAY_KEY_ID` - Client-side key
  - `RAZORPAY_WEBHOOK_SECRET` - Webhook signature verification

### Order Flow
1. User adds items to cart
2. Checkout creates Razorpay order (`/api/razorpay/create-order`)
3. Razorpay modal opens for payment
4. On success, verify signature (`/api/razorpay/verify-payment`)
5. Token assigned (201-999), OTP generated (hashed)
6. Redirect to success page with token

### Order Status Lifecycle
`created` → `PAID` → `Preparing` → `Ready` → `Completed`/`PICKED_UP`

Note: Status values use mixed case to match existing codebase conventions.

## Development Notes
- Uses App Router with route groups: `(dashboards)` for role-based views
- shadcn/ui components located in `src/components/ui/`
- Custom hooks in `src/hooks/` for auth and toast notifications
- AI flows defined in `src/ai/flows/`
- Payment flow uses server-side price verification (never trust client prices)
