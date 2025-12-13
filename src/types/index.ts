
export type OrderStatus = 'Pending' | 'Preparing' | 'Ready' | 'Completed' | 'Archived';

export interface Order {
  id: string;
  studentId: string;
  items: { name: string; quantity: number }[];
  status: OrderStatus;
  createdAt: Date;
}

export interface UserProfile {
    uid: string;
    name: string;
    email: string;
    role: 'manager';
}
