// CLI entry point for the test suite.
//
//   $ npm test
//
// Runs the in-process contract harness and reports pass/fail.

import { runTests } from './test.js';

runTests()
  .then((r) => {
    console.log(`\n✓ ${r.passed} contract tests passed`);
    console.log('  (covers hash determinism, contract shape, witness boundary)');
  })
  .catch((e) => {
    console.error(`\n✗ contract test failed: ${e.message}`);
    process.exit(1);
  });
