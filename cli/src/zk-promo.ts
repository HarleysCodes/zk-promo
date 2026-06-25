// Public API entry point. The dapp is a library that exports:
//   - hashPromoCode(), hashRedemption(), generateRedemptionSecret()
//   - HASH_DOMAIN, REDEMPTION_DOMAIN (domain tag constants)
//   - Contract: the auto-generated contract class
//   - runTests(): an in-process contract test

export { hashPromoCode, hashRedemption, generateRedemptionSecret } from './hash.js';
export { HASH_DOMAIN, REDEMPTION_DOMAIN } from './config.js';
export { Contract, type Ledger, type Witnesses } from '../../contract/managed/contract/index.js';
export { runTests } from './test.js';
