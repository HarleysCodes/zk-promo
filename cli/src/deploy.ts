#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Deploy the ZK Promo contract to Midnight Preview and print the address.
//
// Usage:
//   WALLET_SEED=<64-hex> npx tsx src/deploy.ts
//
// Writes the deployed address to contract-address.txt so issue.ts and
// claim.ts can read it without re-prompting.

import { writeFileSync, existsSync } from 'node:fs';
import {
  buildWalletAndWaitForFunds,
  buildProviders,
  createWalletAndMidnightProvider,
  attachWalletProviders,
  deploy as deployContractApi,
} from './api.js';
import { activeConfig } from './config.js';
import { emptyPrivateState } from './common-types.js';

const ADDR_FILE = 'contract-address.txt';

async function main() {
  const seed = process.env.WALLET_SEED;
  if (!seed) {
    console.error('  ✗ WALLET_SEED env var required (32 bytes hex).');
    console.error('    Generate one: npx tsx src/wallet.ts');
    process.exit(1);
  }
  if (existsSync(ADDR_FILE)) {
    console.error(`  ✗ ${ADDR_FILE} already exists.`);
    console.error('    A deployment is recorded for this wallet. Remove the file to redeploy.');
    process.exit(1);
  }

  const config = activeConfig();
  const ctx = await buildWalletAndWaitForFunds(config, seed);

  const providers = buildProviders(config);
  const wm = await createWalletAndMidnightProvider(ctx);
  const fullProviders = attachWalletProviders(providers, wm);

  const deployed = await deployContractApi(fullProviders, emptyPrivateState());
  const address = deployed.deployTxData.public.contractAddress;
  writeFileSync(ADDR_FILE, address + '\n', 'utf8');

  console.log(`\n  ✓ Saved address to ${ADDR_FILE}`);
  console.log(`    ${address}\n`);
  console.log('  Next steps:');
  console.log('    WALLET_SEED=<seed> npx tsx src/issue.ts <promo-code>   # issue a code');
  console.log(`    WALLET_SEED=<seed> npx tsx src/status.ts              # check on-chain state\n`);
}

main().catch((err) => {
  console.error('\n  ✗ Deploy failed:', err?.message ?? err);
  process.exit(1);
});
