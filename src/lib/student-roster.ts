/**
 * Who counts as a student on the student-facing lists.
 *
 * Both the leaderboard and the owner's Students directory exclude anyone whose email
 * is in `manager_allowlist`, because the operational accounts (kitchen.mrc@,
 * counter.mrc@, …) have no business on a list of students.
 *
 * That rule is right for shared operational logins and wrong for a real person who
 * also happens to be staff: they order lunch like everyone else, and excluding them
 * also removed their own row from the board, which is the only place a student can set
 * a profile photo. So there is a short exception list.
 *
 * Shared by both routes on purpose. They were split once before and the two owner
 * views disagreed about who existed; keeping the decision in one place is what stops
 * that recurring.
 */

/**
 * Staff who should still be ranked and listed as students.
 *
 * Lowercase. These are individual humans, never shared operational accounts — adding
 * kitchen.mrc@ here would put the till on the leaderboard.
 */
export const RANKED_STAFF_EMAILS: ReadonlySet<string> = new Set([
    'dhrupadrajpurohit@gmail.com',
]);

/**
 * True when this account should be left off the student lists.
 *
 * @param email        `users/{uid}.email`
 * @param staffEmails  lowercased doc ids from `manager_allowlist`
 */
export function isExcludedFromStudentLists(
    email: string,
    staffEmails: ReadonlySet<string>,
): boolean {
    if (!email) return false; // no email to match on — treat as a student
    const normalized = email.toLowerCase();
    // The exception wins over the allowlist, so being staff no longer implies hidden.
    if (RANKED_STAFF_EMAILS.has(normalized)) return false;
    return staffEmails.has(normalized);
}
