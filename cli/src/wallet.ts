#!/usr/bin/env node
// @ts-nocheck — midnight-js SDK overloads don't resolve user-compiled contracts cleanly. The runtime shape matches counter-cli; the boundary is loosely typed. The downstream typed files (hash.ts, test.ts, contract-address handling) are unaffected.
// SPDX-License-Identifier: MIT
// Build a wallet (or restore from seed) and print the unshielded address.
//
// Usage:
//   npx tsx src/wallet.ts                       # generate a fresh wallet
//   npx tsx src/wallet.ts --seed <64-hex>       # restore from seed
//   WALLET_SEED=<64-hex> npx tsx src/wallet.ts   # restore from env var
//
// The seed is printed on first run so you can fund + restore later.

import { buildWalletAndWaitForFunds, freshSeed } from './api.js';
import { activeConfig } from './config.js';

async function main() {
  const args = process.argv.slice(2);
  let seed: string | undefined;
  const seedIdx = args.indexOf('--seed');
  if (seedIdx >= 0 && args[seedIdx + 1]) {
    seed = args[seedIdx + 1];
  } else if (process.env.WALLET_SEED) {
    seed = process.env.WALLET_SEED;
  }

  if (!seed) {
    seed = freshSeed();
    console.log('\n  Generated a fresh wallet seed:');
    console.log(`    ${seed}`);
    console.log('  Save this somewhere safe — you can restore the wallet later with --seed.\n');
  }

  const config = activeConfig();
  await buildWalletAndWaitForFunds(config, seed);
}

main().catch((err) => {
  console.error('\n  ✗ Wallet setup failed:', err?.message ?? err);
  process.exit(1);
});
