import { describe, it, expect } from 'vitest';
import { RANKED_STAFF_EMAILS, isExcludedFromStudentLists } from './student-roster';

/**
 * Guards both ends of this: the operational logins must stay off the student lists,
 * and the named exceptions must stay on them. Getting either wrong is quiet — the
 * account simply vanishes from, or appears on, a board nobody is auditing.
 */

const STAFF = new Set(['kitchen.mrc@kanteen.app', 'counter.mrc@kanteen.app', 'dhrupadrajpurohit@gmail.com']);

describe('isExcludedFromStudentLists', () => {
    it('hides shared operational accounts', () => {
        expect(isExcludedFromStudentLists('kitchen.mrc@kanteen.app', STAFF)).toBe(true);
        expect(isExcludedFromStudentLists('counter.mrc@kanteen.app', STAFF)).toBe(true);
    });

    it('keeps a listed exception visible even though they are staff', () => {
        // The reason this function exists: he is in manager_allowlist AND orders lunch,
        // and being hidden also removed the only place a photo can be set.
        expect(isExcludedFromStudentLists('dhrupadrajpurohit@gmail.com', STAFF)).toBe(false);
    });

    it('ignores case on both sides', () => {
        expect(isExcludedFromStudentLists('Dhrupadrajpurohit@Gmail.com', STAFF)).toBe(false);
        expect(isExcludedFromStudentLists('KITCHEN.MRC@kanteen.app', STAFF)).toBe(true);
    });

    it('treats an ordinary student as a student', () => {
        expect(isExcludedFromStudentLists('someone@college.edu', STAFF)).toBe(false);
    });

    it('treats a missing email as a student rather than throwing', () => {
        // Very old user docs predate the email field.
        expect(isExcludedFromStudentLists('', STAFF)).toBe(false);
    });

    it('does not exclude anyone when the allowlist is empty', () => {
        expect(isExcludedFromStudentLists('kitchen.mrc@kanteen.app', new Set())).toBe(false);
    });

    it('holds only individual humans, never shared logins', () => {
        // A shared account here would put the till on the leaderboard.
        for (const email of RANKED_STAFF_EMAILS) {
            expect(email).toBe(email.toLowerCase());
            expect(email).not.toMatch(/^(kitchen|counter|staff|admin)\./);
        }
    });
});
