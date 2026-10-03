

export type OrderStatus = 'pending' | 'PAID' | 'Preparing' | 'Ready' | 'Completed' | 'Archived' | 'PICKED_UP' | 'EXPIRED' | 'CANCELLED';


export interface Order {
  id: string;
  studentId: string;
  items: { name: string; quantity: number; price: number; wantParcel?: boolean }[];
  totalPrice: number;
  /** Target revenue (items + parcel + platform charges) — what Kanteen nets. */
  subtotal?: number;
  /** Grossed-up Razorpay fee charged to the customer (~2.36% of gross). */
  paymentGatewayFee?: number;
  isParcel?: boolean;
  parcelCharge?: number;
  platformCharges?: number;
  note?: string;
  token: number;
  otpHash: string;
  secretOtp?: string; // Plaintext OTP for display
  userEmail?: string;
  userName?: string;
  otp?: {
    verifiedAt?: any;
    attempts?: number;
  };
  status: OrderStatus;
  createdAt: Date;
  dateKey?: string;
  kitchen?: {
    markedPreparingAt?: any;
    readyAt?: any;
    pickedUpAt?: any;
    updatedBy?: string;
  };
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role?: 'manager';
  photoURL?: string;
  updatedAt?: any;
}

/** One row of the monthly spend leaderboard, as it leaves GET /api/leaderboard.
 *
 *  There is no `studentId` here on purpose. The student-facing board shows names,
 *  so the payload is the privacy boundary: `spent` and `orders` are attached only
 *  for the owner/manager, and the uid never ships at all. */
export interface LeaderboardEntry {
  /** 1-based, sequential. Ties are broken, not shared. */
  rank: number;
  /** "Dhrupad R." — first name plus last initial. Single-word names render as-is. */
  displayName: string;
  /** Google profile picture from `users/{uid}.photoURL`, or null. */
  photoURL: string | null;
  isYou: boolean;
  /** Manager-only. Absent in the student payload. */
  spent?: number;
  /** Manager-only. Absent in the student payload. */
  orders?: number;
}

export interface LeaderboardResponse {
  /** 'YYYY-MM' */
  month: string;
  entries: LeaderboardEntry[];
  /** The caller's own row whenever they are on the roster — including when they
   *  are already inside `entries`, and when they have never ordered. Null only if
   *  they have no users/{uid} profile. */
  you: LeaderboardEntry | null;
  /** Every ranked student, so the UI can say "#12 of 433". */
  totalRanked: number;
}

/** One paid order in a student's month history, as it leaves
 *  GET /api/staff/students. `createdAt`/`pickedUpAt` are ISO strings over the
 *  wire; OrderRow coerces them back to Date. */
export interface StudentOrderSummary {
  id: string;
  token: number;
  status: OrderStatus;
  totalPrice: number;
  items: { name: string; quantity: number; price: number }[];
  isParcel: boolean;
  note?: string;
  createdAt: string | null;
  pickedUpAt: string | null;
}

/** A student in the owner's directory, for one month.
 *
 *  Owner-only: unlike LeaderboardEntry this carries uid and email, because the
 *  endpoint is gated on the isOwner claim and has no student-facing tier. */
export interface StudentDirectoryEntry {
  uid: string;
  name: string;
  email: string;
  photoURL: string | null;
  /** Sum over COLLECTED orders only, so it agrees with the leaderboard. */
  spent: number;
  /** Length of `orders` — paid orders in the month, collected or not. */
  orderCount: number;
  orders: StudentOrderSummary[];
}

export interface StudentDirectoryResponse {
  /** 'YYYY-MM' */
  month: string;
  students: StudentDirectoryEntry[];
}

/** General feedback from a signed-in student — not tied to any order.
 *  Stored in `feedback/{autoId}`, written server-side only via POST /api/feedback. */
export interface Feedback {
  id: string;
  /** Who left it — taken from the verified ID token, never the client. */
  studentId: string;
  userName: string;
  userEmail: string;
  /** Integer 1-5. */
  rating: number;
  /** What the feedback is about — one of FEEDBACK_TAGS in @/lib/feedback. */
  tag: string;
  /** Trimmed, max 500 chars. Required. */
  comment: string;
  createdAt: Date;
}

export interface DailyMenu {
  date: string;
  breakfast: string[];
  main: {
    sabji: string;
    dal: string;
    bread: string;
    rice: string;
    salad?: string;
    sweet?: string;
    papad?: string;
    /** Per-item prices for online ordering. If a price is set the item appears as orderable. */
    prices?: {
      sabji?: number;
      dal?: number;
      bread?: number;
      rice?: number;
      salad?: number;
      sweet?: number;
      papad?: number;
    };
  };
  snacks: string[];
  special: string[];
  visibility: {
    breakfast: boolean;
    main: boolean;
    snacks: boolean;
    special: boolean;
    note: boolean;
  };
  // Keep prepared optional for backward compatibility
  prepared?: {
    sabji: string;
    bread: string;
    dal: string;
    rice: string;
    snacks01: string;
    snacks02: string;
    specials: string;
  };
  note: string;
  updatedAt?: any;
  updatedBy?: string;
}

export interface MenuOptions {
  [category: string]: string[];
}

// ============================================================
// Razorpay Payment Integration Types
// ============================================================

export type PaymentStatus = 'created' | 'paid' | 'failed';

export interface CheckoutItem {
  itemId: string;
  name: string;
  qty: number;
  price: number;
  /** Whether the student wants this item parcelled. daily_menu items are always true. */
  wantParcel?: boolean;
}

// API Request/Response types
export interface CreateRazorpayOrderRequest {
  items: CheckoutItem[];
  isParcel?: boolean;
  platformCharges?: number;
  /** Kitchen notes (e.g., "make it spicy", "less oil") - max 200 chars */
  note?: string;
}

/**
 * The promotional banner at the top of the student dashboard, set from /report.
 *
 * Stored on `canteen_state/settings.studentBanner`, which is already public-read /
 * manager-write in firestore.rules, so students pick up a change live with no extra
 * read. Absent means fall back to the image bundled in /public.
 */
export interface StudentBanner {
    /** Firebase Storage download URL. Already allowed by the CSP img-src and by
     *  next.config.ts remotePatterns — an arbitrary host would be blocked. */
    url: string;
    /** Storage object path, kept so replacing the banner can delete the old file
     *  instead of leaving the bucket to accumulate every image ever uploaded. */
    path: string;
    /** Real pixel dimensions, read from the file at upload time. Passing the actual
     *  aspect ratio to next/Image is what stops a non-4:1 upload rendering squashed. */
    width: number;
    height: number;
    alt?: string;
    updatedAt?: any;
    updatedByName?: string;
}

/** The student's last-used payment details, kept so a returning student skips the
 *  phone-entry and method-list screens.
 *
 *  Stored on `users/{uid}.payPref` by the server, NOT on the order document:
 *  firestore.rules lets any signed-in student read any order in Preparing/Ready
 *  for the display board, so a phone number or VPA there would be public to the
 *  whole campus. `users/{uid}` is read-own only. */
export interface PayPref {
  contact?: string;  // e.g. "+919876543210"
  method?: string;   // 'upi' | 'card' | 'netbanking' | 'wallet'
  vpa?: string;      // e.g. "user@ybl" (only when method = 'upi')
}

export interface CreateRazorpayOrderResponse {
  razorpayOrderId: string;
  orderId: string;
  amount: number;         // in paise
  currency: string;
  keyId: string;          // Razorpay key ID (public)
  prefill: {
    name: string;
    email: string;
  };
  /** Absent for a first-time payer, and absent if the lookup failed — the client
   *  falls back to its localStorage copy either way. */
  payPref?: PayPref;
}

export interface VerifyPaymentRequest {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  orderId: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  orderId: string;
  token: number;
  /** Returned once after payment so the client can cache it for future pre-fills. */
  paymentContact?: string; // e.g. "+919876543210"
  paymentMethod?: string;  // 'upi' | 'card' | 'netbanking' | 'wallet'
  paymentVpa?: string;     // e.g. "user@ybl" (only when method = 'upi')
}

// ============================================================
// Print Service Types
// ============================================================

export type PrintJobStatus = 'pending' | 'printing' | 'completed' | 'failed';

export interface PrintJob {
  id: string;
  orderId: string;
  token: number;
  items: { name: string; quantity: number; price: number; wantParcel?: boolean }[];
  totalPrice: number;
  customerName?: string;
  customerEmail?: string;
  note?: string;
  isParcel?: boolean;
  status: PrintJobStatus;
  createdAt: Date;
  printedAt?: Date;
  printerId?: string; // ID of the printer/device that processed this job
}

export interface PrintQueueResponse {
  jobs: PrintJob[];
  count: number;
}

export interface AddPrintJobRequest {
  orderId: string;
  token: number;
  items: { name: string; quantity: number; price: number; wantParcel?: boolean }[];
  totalPrice: number;
  customerName?: string;
  customerEmail?: string;
  isParcel?: boolean;
}

export interface CompletePrintJobRequest {
  jobId: string;
  printerId?: string;
}
