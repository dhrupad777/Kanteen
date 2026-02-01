/**
 * Script to set Firebase Custom Claims for RBAC
 * 
 * Usage:
 *   npx ts-node scripts/set-custom-claims.ts <email> <role>
 * 
 * Roles:
 *   - student
 *   - kitchen_staff
 *   - kitchen_manager
 *   - admin
 * 
 * Examples:
 *   npx ts-node scripts/set-custom-claims.ts john@example.com kitchen_staff
 *   npx ts-node scripts/set-custom-claims.ts admin@kanteen.com admin
 * 
 * Prerequisites:
 *   - GOOGLE_APPLICATION_CREDENTIALS environment variable must be set
 *   - OR Firebase service account JSON must be in the project root
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Valid roles
const VALID_ROLES = ['student', 'kitchen_staff', 'kitchen_manager', 'admin'] as const;
type Role = typeof VALID_ROLES[number];

// Initialize Firebase Admin
function initializeFirebase() {
    if (admin.apps.length > 0) {
        return admin.apps[0]!;
    }

    // Try to use service account from environment
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (serviceAccountPath) {
        const serviceAccount = require(serviceAccountPath);
        return admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    }

    // Try to use default credentials
    return admin.initializeApp({
        credential: admin.credential.applicationDefault(),
    });
}

async function setCustomClaims(email: string, role: Role) {
    try {
        initializeFirebase();
        const auth = admin.auth();

        // Get user by email
        const user = await auth.getUserByEmail(email);
        console.log(`Found user: ${user.uid} (${user.email})`);

        // Set custom claims
        await auth.setCustomUserClaims(user.uid, { role });
        console.log(`✅ Successfully set role '${role}' for user ${email}`);

        // Verify the claims were set
        const updatedUser = await auth.getUser(user.uid);
        console.log('Current claims:', updatedUser.customClaims);

        return { success: true, role };
    } catch (error: any) {
        console.error('❌ Error setting custom claims:', error.message);

        if (error.code === 'auth/user-not-found') {
            console.error('User not found. Make sure the email is correct.');
        }

        return { success: false, error: error.message };
    }
}

async function listUserClaims(email: string) {
    try {
        initializeFirebase();
        const auth = admin.auth();

        const user = await auth.getUserByEmail(email);
        console.log(`User: ${user.uid} (${user.email})`);
        console.log('Custom Claims:', user.customClaims || '(none)');

        return user.customClaims;
    } catch (error: any) {
        console.error('❌ Error getting user claims:', error.message);
        return null;
    }
}

// CLI entry point
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
Firebase Custom Claims Manager

Usage:
  npx ts-node scripts/set-custom-claims.ts <email> <role>
  npx ts-node scripts/set-custom-claims.ts --list <email>

Roles: ${VALID_ROLES.join(', ')}

Examples:
  npx ts-node scripts/set-custom-claims.ts john@example.com kitchen_staff
  npx ts-node scripts/set-custom-claims.ts --list john@example.com
`);
        process.exit(1);
    }

    if (args[0] === '--list' && args[1]) {
        await listUserClaims(args[1]);
        process.exit(0);
    }

    const [email, role] = args;

    if (!email || !role) {
        console.error('❌ Both email and role are required');
        process.exit(1);
    }

    if (!VALID_ROLES.includes(role as Role)) {
        console.error(`❌ Invalid role: ${role}`);
        console.error(`Valid roles: ${VALID_ROLES.join(', ')}`);
        process.exit(1);
    }

    await setCustomClaims(email, role as Role);
    process.exit(0);
}

main().catch(console.error);

export { setCustomClaims, listUserClaims, VALID_ROLES };
