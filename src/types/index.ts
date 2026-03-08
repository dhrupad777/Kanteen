

export type OrderStatus = 'pending' | 'PAID' | 'Preparing' | 'Ready' | 'Completed' | 'Archived' | 'PICKED_UP' | 'EXPIRED' | 'CANCELLED';


export interface Order {
  id: string;
  studentId: string;
  items: { name: string; quantity: number; price: number }[];
  totalPrice: number;
  isParcel?: boolean;
  platformCharges?: number;
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

export interface DailyMenu {
  date: string;
  breakfast: string[];
  main: {
    sabji: string;
    dal: string;
    bread: string;
    rice: string;
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
}

// API Request/Response types
export interface CreateRazorpayOrderRequest {
  items: CheckoutItem[];
  isParcel?: boolean;
  platformCharges?: number;
  /** Kitchen notes (e.g., "make it spicy", "less oil") - max 200 chars */
  note?: string;
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
  // OTP is generated when order is marked "Ready" by staff, not at payment time
}

// ============================================================
// Print Service Types
// ============================================================

export type PrintJobStatus = 'pending' | 'printing' | 'completed' | 'failed';

export interface PrintJob {
  id: string;
  orderId: string;
  token: number;
  items: { name: string; quantity: number; price: number }[];
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
  items: { name: string; quantity: number; price: number }[];
  totalPrice: number;
  customerName?: string;
  customerEmail?: string;
  isParcel?: boolean;
}

export interface CompletePrintJobRequest {
  jobId: string;
  printerId?: string;
}
