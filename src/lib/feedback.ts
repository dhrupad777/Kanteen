/**
 * Validation rules for student feedback, shared by the API route and the
 * client dialog so the two can never disagree about what is acceptable.
 *
 * Feedback is general — it is not tied to an order. Every submission needs a
 * rating, a tag saying what it is about, and a written comment.
 */

/** Max length of the comment. */
export const MAX_COMMENT_LENGTH = 500;

/** What a piece of feedback is about. Stored as the `value`; `label` is display only. */
export const FEEDBACK_TAGS = [
    { value: 'food', label: 'Food' },
    { value: 'service', label: 'Service' },
    { value: 'canteen', label: 'Canteen' },
    { value: 'suggestion', label: 'New Suggestion' },
] as const;

export type FeedbackTag = (typeof FEEDBACK_TAGS)[number]['value'];

const TAG_VALUES: readonly string[] = FEEDBACK_TAGS.map(t => t.value);

/** Display label for a stored tag value; falls back to the raw value. */
export function feedbackTagLabel(value: string): string {
    return FEEDBACK_TAGS.find(t => t.value === value)?.label ?? value;
}

/** Validates a submitted rating. Returns null when valid, or an error message. */
export function validateRating(rating: unknown): string | null {
    if (typeof rating !== 'number' || !Number.isInteger(rating)) {
        return 'Rating must be a whole number';
    }
    if (rating < 1 || rating > 5) {
        return 'Rating must be between 1 and 5';
    }
    return null;
}

/** Validates the tag. Exactly one, and it must be a known value. */
export function validateTag(tag: unknown): string | null {
    if (typeof tag !== 'string' || !tag.trim()) {
        return 'Please choose what your feedback is about';
    }
    if (!TAG_VALUES.includes(tag)) {
        return 'Unknown feedback tag';
    }
    return null;
}

/**
 * Normalizes the comment. Returns the trimmed string, or an error message
 * prefixed with `!` — callers check with `startsWith('!')`.
 *
 * The comment is required: staff need to know *why* a rating was given, and a
 * tag alone does not carry that.
 */
export function normalizeComment(comment: unknown): { value: string } | { error: string } {
    if (typeof comment !== 'string') {
        return { error: 'Please write your feedback' };
    }
    const trimmed = comment.trim();
    if (!trimmed) {
        return { error: 'Please write your feedback' };
    }
    if (trimmed.length > MAX_COMMENT_LENGTH) {
        return { error: 'Comment is too long' };
    }
    return { value: trimmed };
}
