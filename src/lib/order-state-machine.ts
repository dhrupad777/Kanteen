/**
 * Order State Machine - Enforces valid status transitions
 * Prevents race conditions and unauthorized state changes
 */

export type OrderStatus = 'pending' | 'Preparing' | 'Ready' | 'PICKED_UP' | 'EXPIRED' | 'CANCELLED';

export type ActorRole = 'system' | 'student' | 'kitchen_staff' | 'kitchen_manager' | 'admin';

interface TransitionRule {
    to: OrderStatus[];
    allowedRoles: ActorRole[];
    requiresOtp?: boolean;
}

/**
 * Defines the valid state transitions and who can perform them
 */
const STATE_TRANSITIONS: Record<OrderStatus, TransitionRule> = {
    'pending': {
        to: ['Preparing', 'EXPIRED', 'CANCELLED'],
        allowedRoles: ['system', 'admin'], // Only payment verification (system) can move to Preparing
    },
    'Preparing': {
        to: ['Ready', 'CANCELLED'],
        allowedRoles: ['kitchen_staff', 'kitchen_manager', 'admin'],
    },
    'Ready': {
        to: ['PICKED_UP', 'CANCELLED'],
        allowedRoles: ['kitchen_staff', 'kitchen_manager', 'admin'],
        requiresOtp: true, // OTP required to move to PICKED_UP
    },
    'PICKED_UP': {
        to: [], // Terminal state
        allowedRoles: [],
    },
    'EXPIRED': {
        to: [], // Terminal state
        allowedRoles: [],
    },
    'CANCELLED': {
        to: [], // Terminal state
        allowedRoles: [],
    },
};

export interface TransitionResult {
    valid: boolean;
    error?: string;
    requiresOtp?: boolean;
}

/**
 * Validate if a status transition is allowed
 */
export function validateTransition(
    currentStatus: OrderStatus,
    newStatus: OrderStatus,
    actorRole: ActorRole
): TransitionResult {
    const rule = STATE_TRANSITIONS[currentStatus];

    if (!rule) {
        return { valid: false, error: `Unknown current status: ${currentStatus}` };
    }

    if (!rule.to.includes(newStatus)) {
        return { valid: false, error: `Cannot transition from ${currentStatus} to ${newStatus}` };
    }

    if (!rule.allowedRoles.includes(actorRole)) {
        return { valid: false, error: `Role ${actorRole} cannot perform this transition` };
    }

    // Special case: Ready → PICKED_UP requires OTP
    if (currentStatus === 'Ready' && newStatus === 'PICKED_UP' && rule.requiresOtp) {
        return { valid: true, requiresOtp: true };
    }

    return { valid: true };
}

/**
 * Get allowed next statuses for a given role
 */
export function getAllowedTransitions(currentStatus: OrderStatus, actorRole: ActorRole): OrderStatus[] {
    const rule = STATE_TRANSITIONS[currentStatus];
    if (!rule || !rule.allowedRoles.includes(actorRole)) {
        return [];
    }
    return rule.to;
}

/**
 * Check if a status is terminal (no further transitions possible)
 */
export function isTerminalStatus(status: OrderStatus): boolean {
    const rule = STATE_TRANSITIONS[status];
    return !rule || rule.to.length === 0;
}

/**
 * Map email-based roles to ActorRole (for backward compatibility with manager_allowlist)
 */
export function getActorRoleFromToken(decodedToken: { role?: string; email?: string }): ActorRole {
    // First check custom claims
    if (decodedToken.role) {
        const validRoles: ActorRole[] = ['student', 'kitchen_staff', 'kitchen_manager', 'admin'];
        if (validRoles.includes(decodedToken.role as ActorRole)) {
            return decodedToken.role as ActorRole;
        }
    }
    // Default to student if no role is set
    return 'student';
}
