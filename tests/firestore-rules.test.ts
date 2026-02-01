/**
 * Firestore Security Rules Unit Tests
 * 
 * Run with Firebase Emulator:
 *   firebase emulators:start --only firestore
 *   npx vitest run tests/firestore-rules.test.ts
 */

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let testEnv: RulesTestEnvironment;

const PROJECT_ID = 'kanteen-test';

// Test user contexts
const STUDENT_A = { uid: 'student-a', email: 'student.a@example.com' };
const STUDENT_B = { uid: 'student-b', email: 'student.b@example.com' };
const KITCHEN_STAFF = { uid: 'staff-1', email: 'staff@kanteen.com', role: 'kitchen_staff' };
const ADMIN = { uid: 'admin-1', email: 'admin@kanteen.com', role: 'admin' };

// Helper to get authenticated context with custom claims
function getContext(auth: { uid: string; email: string; role?: string }) {
    return testEnv.authenticatedContext(auth.uid, {
        email: auth.email,
        role: auth.role,
    });
}

function getUnauthContext() {
    return testEnv.unauthenticatedContext();
}

describe('Firestore Security Rules', () => {
    beforeAll(async () => {
        const rules = readFileSync('firestore.rules', 'utf8');
        testEnv = await initializeTestEnvironment({
            projectId: PROJECT_ID,
            firestore: { rules, host: 'localhost', port: 8080 },
        });
    });

    afterAll(async () => {
        await testEnv.cleanup();
    });

    beforeEach(async () => {
        await testEnv.clearFirestore();
    });

    // ==================== ORDERS COLLECTION ====================

    describe('/orders', () => {
        const ORDER_ID = 'order-123';

        beforeEach(async () => {
            // Seed test order via admin context (bypasses rules)
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const db = context.firestore();
                await setDoc(doc(db, 'orders', ORDER_ID), {
                    studentId: STUDENT_A.uid,
                    items: [{ name: 'Samosa', quantity: 2, price: 20 }],
                    totalPrice: 40,
                    status: 'Preparing',
                    token: 201,
                    payment: { status: 'paid' },
                });
            });
        });

        it('Student A can read their own order', async () => {
            const db = getContext(STUDENT_A).firestore();
            await assertSucceeds(getDoc(doc(db, 'orders', ORDER_ID)));
        });

        it('Student B CANNOT read Student A order', async () => {
            const db = getContext(STUDENT_B).firestore();
            await assertFails(getDoc(doc(db, 'orders', ORDER_ID)));
        });

        it('Unauthenticated CANNOT read any order', async () => {
            const db = getUnauthContext().firestore();
            await assertFails(getDoc(doc(db, 'orders', ORDER_ID)));
        });

        it('Kitchen staff CAN read any order', async () => {
            const db = getContext(KITCHEN_STAFF).firestore();
            await assertSucceeds(getDoc(doc(db, 'orders', ORDER_ID)));
        });

        it('Student A CANNOT update their own order', async () => {
            const db = getContext(STUDENT_A).firestore();
            await assertFails(updateDoc(doc(db, 'orders', ORDER_ID), { status: 'Ready' }));
        });

        it('Kitchen staff CAN update status', async () => {
            const db = getContext(KITCHEN_STAFF).firestore();
            await assertSucceeds(updateDoc(doc(db, 'orders', ORDER_ID), {
                status: 'Ready',
                'kitchen.readyAt': new Date(),
            }));
        });

        it('Kitchen staff CANNOT update items', async () => {
            const db = getContext(KITCHEN_STAFF).firestore();
            await assertFails(updateDoc(doc(db, 'orders', ORDER_ID), {
                items: [{ name: 'Hacked', quantity: 100, price: 0 }],
            }));
        });

        it('Kitchen staff CANNOT update amount', async () => {
            const db = getContext(KITCHEN_STAFF).firestore();
            await assertFails(updateDoc(doc(db, 'orders', ORDER_ID), {
                totalPrice: 0,
            }));
        });

        it('Kitchen staff CANNOT update payment fields', async () => {
            const db = getContext(KITCHEN_STAFF).firestore();
            await assertFails(updateDoc(doc(db, 'orders', ORDER_ID), {
                'payment.status': 'refunded',
            }));
        });

        it('Student CANNOT create order directly', async () => {
            const db = getContext(STUDENT_A).firestore();
            await assertFails(setDoc(doc(db, 'orders', 'new-order'), {
                studentId: STUDENT_A.uid,
                status: 'Preparing',
                token: 999,
            }));
        });

        it('Admin CAN delete order', async () => {
            const db = getContext(ADMIN).firestore();
            await assertSucceeds(deleteDoc(doc(db, 'orders', ORDER_ID)));
        });

        it('Kitchen staff CANNOT delete order', async () => {
            const db = getContext(KITCHEN_STAFF).firestore();
            await assertFails(deleteDoc(doc(db, 'orders', ORDER_ID)));
        });
    });

    // ==================== AUDIT LOGS ====================

    describe('/audit_logs', () => {
        it('Admin CAN read audit logs', async () => {
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const db = context.firestore();
                await addDoc(collection(db, 'audit_logs'), {
                    eventType: 'TEST',
                    timestamp: new Date(),
                });
            });

            const db = getContext(ADMIN).firestore();
            await assertSucceeds(getDoc(doc(db, 'audit_logs', 'test-log')));
        });

        it('Kitchen staff CANNOT read audit logs', async () => {
            const db = getContext(KITCHEN_STAFF).firestore();
            await assertFails(getDoc(doc(db, 'audit_logs', 'any-log')));
        });

        it('Nobody can write to audit logs from client', async () => {
            const db = getContext(ADMIN).firestore();
            await assertFails(addDoc(collection(db, 'audit_logs'), {
                eventType: 'MALICIOUS',
            }));
        });
    });

    // ==================== WEBHOOK EVENTS ====================

    describe('/webhook_events', () => {
        it('Nobody can write to webhook_events from client', async () => {
            const db = getContext(ADMIN).firestore();
            await assertFails(setDoc(doc(db, 'webhook_events', 'event-1'), {
                processedAt: new Date(),
            }));
        });

        it('Nobody can read webhook_events from client', async () => {
            const db = getContext(ADMIN).firestore();
            await assertFails(getDoc(doc(db, 'webhook_events', 'event-1')));
        });
    });

    // ==================== PRINT JOBS ====================

    describe('/print_jobs', () => {
        it('Nobody can write to print_jobs from client', async () => {
            const db = getContext(ADMIN).firestore();
            await assertFails(setDoc(doc(db, 'print_jobs', 'job-1'), {
                status: 'queued',
            }));
        });
    });

    // ==================== MENU ITEMS (Public read) ====================

    describe('/menu_items', () => {
        it('Unauthenticated users CAN read menu items', async () => {
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const db = context.firestore();
                await setDoc(doc(db, 'menu_items', 'samosa'), { name: 'Samosa', price: 20 });
            });

            const db = getUnauthContext().firestore();
            await assertSucceeds(getDoc(doc(db, 'menu_items', 'samosa')));
        });

        it('Students CANNOT write to menu items', async () => {
            const db = getContext(STUDENT_A).firestore();
            await assertFails(setDoc(doc(db, 'menu_items', 'hacked'), { name: 'Free Food', price: 0 }));
        });
    });
});
