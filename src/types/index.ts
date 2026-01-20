
export type OrderStatus = 'PAID' | 'Preparing' | 'Ready' | 'Completed' | 'Archived' | 'PICKED_UP';

export interface Order {
  id: string;
  studentId: string;
  items: { name: string; quantity: number; price: number }[];
  totalPrice: number;
  isParcel?: boolean;
  platformCharges?: number;
  token: number;
  otpHash: string;
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
