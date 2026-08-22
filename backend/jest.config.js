/** Jest configured for native Node ESM (package.json "type":"module").
 *  Run via `npm test`, which passes --experimental-vm-modules (see RULES.md
 *  decision log: jest kept per RFC stack, ESM flag is the trade-off). */
export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/tests/**/*.test.js'],
};
