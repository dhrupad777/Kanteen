import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * `npm test` covers the unit tests under src/ only.
 *
 * tests/firestore-rules.test.ts is deliberately excluded: it needs a running Firestore
 * emulator and is invoked by `npm run test:rules` after starting one, exactly as its own
 * header documents. Including it here would make `npm test` fail on a clean checkout,
 * which is how a test suite stops being run at all.
 */
export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
    },
    resolve: {
        alias: { '@': resolve(__dirname, 'src') },
    },
});
