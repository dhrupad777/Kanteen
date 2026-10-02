/**
 * Builds the `config.display` object handed to Razorpay Checkout.
 *
 * Pure on purpose. The interesting decision — which UPI flow to offer — depends on
 * whether we are running as an installed PWA, and that is the one thing that cannot
 * be reproduced in a test or on a desktop. So the environment is detected at the call
 * site and passed in as a plain boolean, leaving every branch here verifiable.
 *
 * ── Why the UPI flow varies ──────────────────────────────────────────────────
 * Razorpay Checkout renders inside a cross-origin iframe. Its UPI *intent* buttons
 * deep-link into GPay/PhonePe via a `upi:` / `intent:` navigation. Under
 * `display-mode: standalone` Chrome launches the app but drops the payment payload on
 * that navigation, so the student arrives in Google Pay with nothing loaded and cannot
 * pay. It is self-sustaining: the payment never completes, so no VPA is ever cached,
 * so the collect pre-fill never has anything to use, so the next attempt takes the
 * same broken route.
 *
 * In standalone we therefore pin UPI to the `collect` flow, which involves no deep
 * link at all — Razorpay raises a collect request and the UPI app shows an approval
 * notification carrying the correct amount. A browser tab keeps `intent`, where it
 * works and is fewer taps.
 *
 * ── Known limitation, deliberately accepted ─────────────────────────────────
 * `show_default_blocks: true` means Razorpay also surfaces its own instruments under
 * "Other methods", so a student who digs into that block can still reach intent. This
 * makes collect the default and primary path in a PWA; it does not remove intent
 * entirely. Removing it would require `show_default_blocks: false` plus enumerating
 * every method by hand, which would silently drop any method not on that list —
 * a worse failure than one extra tap.
 */

/** Razorpay's own option shape. Loose by necessity: Checkout is configured through an
 *  untyped JS global, so this is the contract we assert in tests, not one it gives us. */
export interface RazorpayDisplayConfig {
    display: {
        defaultBlock?: string;
        blocks?: Record<string, { name: string; instruments?: Array<Record<string, unknown>> }>;
        sequence?: string[];
        preferences?: { show_default_blocks: boolean };
    };
}

/** The block map, with the `undefined` stripped so it can be assembled field by field. */
type DisplayBlocks = NonNullable<RazorpayDisplayConfig['display']['blocks']>;

export interface DisplayConfigInput {
    /** `payPref.method` — the method this student last paid with, if any. */
    savedMethod?: string;
    /** True when running as a home-screen installed app rather than a browser tab. */
    isStandalone: boolean;
}

/**
 * Returns the config to pass to Razorpay, or `undefined` when none should be sent.
 *
 * Returning `undefined` rather than an empty object is the point: an earlier version
 * attached `{ display: {} }` for anyone whose saved method was neither UPI nor card,
 * which told Razorpay nothing while looking deliberate. The "never send a meaningless
 * config" rule now lives in the one place it can be tested, instead of as a condition
 * at the call site that the next edit can forget.
 */
export function buildDisplayConfig({ savedMethod, isStandalone }: DisplayConfigInput): RazorpayDisplayConfig | undefined {
    // The single security-relevant line in this file: a browser tab must never be
    // downgraded to collect, and a PWA must never be handed intent.
    const upiInstrument: Record<string, unknown> = isStandalone
        ? { method: 'upi', flows: ['collect'] }
        : { method: 'upi' };

    const upiBlock = { name: 'Pay via UPI', instruments: [upiInstrument] };
    const otherBlock = { name: 'Other methods' };
    const preferences = { show_default_blocks: true };

    // Saved preferences win, so a returning student lands on the method they actually
    // use. Checked before the standalone fallback precisely so a card user in the PWA
    // is never pushed onto UPI.
    if (savedMethod === 'upi') {
        return {
            display: {
                defaultBlock: 'upi',
                blocks: { upi: upiBlock, other: otherBlock },
                sequence: ['block.upi', 'block.other'],
                preferences,
            },
        };
    }

    if (savedMethod === 'card') {
        // Built up rather than branched into two object literals: a ternary here produces
        // a union with `upi?: undefined`, which does not satisfy the block index
        // signature, and widening the type to silence that would give up the checking
        // this file exists to provide.
        const blocks: DisplayBlocks = {
            card: { name: 'Pay via Card', instruments: [{ method: 'card' }] },
        };
        const sequence = ['block.card'];
        // In a PWA the UPI block rides along, pinned to collect, so that picking UPI
        // from this screen does not fall through to the broken intent handoff.
        if (isStandalone) {
            blocks.upi = upiBlock;
            sequence.push('block.upi');
        }
        blocks.other = otherBlock;
        sequence.push('block.other');

        return { display: { defaultBlock: 'card', blocks, sequence, preferences } };
    }

    // No usable saved method. In a PWA we still need UPI pinned to collect — these are
    // first-time payers, the people most likely to hit the broken handoff. No
    // `defaultBlock`, so they still choose freely.
    if (isStandalone) {
        return {
            display: {
                blocks: { upi: upiBlock, other: otherBlock },
                sequence: ['block.upi', 'block.other'],
                preferences,
            },
        };
    }

    // Browser tab, nothing worth saying — let Razorpay show its own default UI.
    return undefined;
}
