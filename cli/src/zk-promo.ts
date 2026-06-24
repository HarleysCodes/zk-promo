// Public API entry point. The dapp is a library that exports:
//   - hashPromoCode(): the canonical hash recipe
//   - Contract: the auto-generated contract class
//   - runTests(): an in-process contract test

export { hashPromoCode } from './hash.js';
export { Contract, type Ledger, type Witnesses } from '../managed/contract/index.js';
export { runTests } from './test.js';

// Re-export the HASH_DOMAIN constant so consumers can verify
// they're using the same domain tag as the contract.
export { HASH_DOMAIN } from './config.js';
