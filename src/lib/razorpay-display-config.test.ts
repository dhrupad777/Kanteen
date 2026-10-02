import { describe, it, expect } from 'vitest';
import { buildDisplayConfig } from './razorpay-display-config';

/**
 * These tests exist because the bug they guard against is invisible locally: UPI intent
 * only breaks in an installed PWA on a real phone, so nobody notices a regression here
 * until a student cannot pay. The environment check is kept out of this module so every
 * branch below is reachable without a browser.
 *
 * What these DO prove: the right flow is requested for each combination of saved method
 * and display mode. What they CANNOT prove: that Chrome then behaves as expected on the
 * deep link. That still needs a device.
 */

const BROWSER = { isStandalone: false };
const PWA = { isStandalone: true };

/** Pulls the UPI instrument out of wherever it ended up in the block map. */
function upiInstrument(cfg: ReturnType<typeof buildDisplayConfig>) {
    return cfg?.display.blocks?.upi?.instruments?.[0];
}

describe('buildDisplayConfig — browser tab', () => {
    it('sends no config for a first-time payer, rather than an empty one', () => {
        // Razorpay should fall back to its own default UI here.
        expect(buildDisplayConfig({ ...BROWSER })).toBeUndefined();
    });

    it('sends no config for a saved method it has no opinion about', () => {
        // Previously this attached { display: {} } — deliberate-looking but meaningless.
        expect(buildDisplayConfig({ ...BROWSER, savedMethod: 'netbanking' })).toBeUndefined();
        expect(buildDisplayConfig({ ...BROWSER, savedMethod: 'wallet' })).toBeUndefined();
    });

    it('keeps UPI on intent — never downgrades a working browser flow', () => {
        const cfg = buildDisplayConfig({ ...BROWSER, savedMethod: 'upi' });
        expect(cfg?.display.defaultBlock).toBe('upi');
        expect(upiInstrument(cfg)).toEqual({ method: 'upi' });
        expect(upiInstrument(cfg)).not.toHaveProperty('flows');
    });

    it('jumps a card user straight to card', () => {
        const cfg = buildDisplayConfig({ ...BROWSER, savedMethod: 'card' });
        expect(cfg?.display.defaultBlock).toBe('card');
        expect(cfg?.display.sequence).toEqual(['block.card', 'block.other']);
    });
});

describe('buildDisplayConfig — installed PWA', () => {
    it('pins UPI to collect for a first-time payer', () => {
        // The original bug: no saved method meant no config at all, so these students
        // got default intent and could never complete a payment.
        const cfg = buildDisplayConfig({ ...PWA });
        expect(cfg).toBeDefined();
        expect(upiInstrument(cfg)).toEqual({ method: 'upi', flows: ['collect'] });
    });

    it('leaves the method choice open when there is no saved preference', () => {
        expect(buildDisplayConfig({ ...PWA })?.display.defaultBlock).toBeUndefined();
    });

    it('pins UPI to collect and still defaults a returning UPI user to it', () => {
        const cfg = buildDisplayConfig({ ...PWA, savedMethod: 'upi' });
        expect(cfg?.display.defaultBlock).toBe('upi');
        expect(upiInstrument(cfg)).toEqual({ method: 'upi', flows: ['collect'] });
    });

    it('does NOT hijack a card user onto UPI', () => {
        // Regression guard: an early version checked isStandalone before savedMethod,
        // which pushed every PWA card user onto the UPI block.
        const cfg = buildDisplayConfig({ ...PWA, savedMethod: 'card' });
        expect(cfg?.display.defaultBlock).toBe('card');
        expect(cfg?.display.sequence?.[0]).toBe('block.card');
    });

    it('still pins UPI to collect for a card user, so switching method is safe', () => {
        const cfg = buildDisplayConfig({ ...PWA, savedMethod: 'card' });
        expect(upiInstrument(cfg)).toEqual({ method: 'upi', flows: ['collect'] });
    });

    it('pins UPI to collect even for a method it has no opinion about', () => {
        const cfg = buildDisplayConfig({ ...PWA, savedMethod: 'wallet' });
        expect(upiInstrument(cfg)).toEqual({ method: 'upi', flows: ['collect'] });
    });
});

describe('buildDisplayConfig — invariants across every input', () => {
    const methods = [undefined, 'upi', 'card', 'netbanking', 'wallet', '', 'UPI', 'nonsense'];

    it('never returns a config whose display says nothing', () => {
        for (const savedMethod of methods) {
            for (const isStandalone of [true, false]) {
                const cfg = buildDisplayConfig({ savedMethod, isStandalone });
                if (cfg) expect(Object.keys(cfg.display).length).toBeGreaterThan(0);
            }
        }
    });

    it('never offers collect in a browser tab', () => {
        for (const savedMethod of methods) {
            const instrument = upiInstrument(buildDisplayConfig({ savedMethod, isStandalone: false }));
            if (instrument) expect(instrument).not.toHaveProperty('flows');
        }
    });

    it('never offers unrestricted UPI in a PWA', () => {
        // The core guarantee. If a future edit adds a branch that forgets `flows`,
        // this fails rather than shipping a payment nobody can complete.
        for (const savedMethod of methods) {
            const cfg = buildDisplayConfig({ savedMethod, isStandalone: true });
            const instrument = upiInstrument(cfg);
            if (instrument) expect(instrument).toEqual({ method: 'upi', flows: ['collect'] });
        }
    });

    it('always declares a sequence covering the blocks it defines', () => {
        for (const savedMethod of methods) {
            for (const isStandalone of [true, false]) {
                const cfg = buildDisplayConfig({ savedMethod, isStandalone });
                if (!cfg?.display.blocks) continue;
                const declared = Object.keys(cfg.display.blocks).map((k) => `block.${k}`).sort();
                expect([...(cfg.display.sequence ?? [])].sort()).toEqual(declared);
            }
        }
    });

    it('is case-sensitive on method, matching how Razorpay reports it', () => {
        // 'UPI' is not a value Razorpay sends; treating it as UPI would be a guess.
        expect(buildDisplayConfig({ savedMethod: 'UPI', isStandalone: false })).toBeUndefined();
    });
});
