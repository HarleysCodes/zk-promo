#!/usr/bin/env node
// @ts-nocheck — midnight-js SDK overloads don't resolve user-compiled contracts cleanly. The runtime shape matches counter-cli; the boundary is loosely typed. The downstream typed files (hash.ts, test.ts, contract-address handling) are unaffected.
// SPDX-License-Identifier: MIT
// User: claim a promo code by submitting the plaintext (via the witness).
//
// Usage:
//   WALLET_SEED=<64-hex> npx tsx src/claim.ts <promo-code>
//
// The plaintext goes ONLY into the local witness. Only the hash derived
// from it touches the chain.

import { readFileSync, existsSync } from 'node:fs';
import { buildWalletAndWaitForFunds, buildProviders, createWalletAndMidnightProvider, attachWalletProviders, claim as claimApi } from './api.js';
import { activeConfig, contractConfig } from './config.js';
import { emptyPrivateState } from './common-types.js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js/contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { Contract as ZkPromoContract } from '../../contract/managed/contract/index.js';

const ADDR_FILE = 'contract-address.txt';

async function main() {
  const seed = process.env.WALLET_SEED;
  if (!seed) {
    console.error('  ✗ WALLET_SEED env var required (32 bytes hex).');
    process.exit(1);
  }
  const code = process.argv[2];
  if (!code || code.length === 0 || code.length > 32) {
    console.error('  ✗ Pass a promo code (1-32 bytes) as the first argument.');
    process.exit(1);
  }
  if (!existsSync(ADDR_FILE)) {
    console.error(`  ✗ ${ADDR_FILE} not found. Run deploy.ts first.`);
    process.exit(1);
  }
  const contractAddress = readFileSync(ADDR_FILE, 'utf8').trim();

  const config = activeConfig();
  const ctx = await buildWalletAndWaitForFunds(config, seed);
  const providers = buildProviders(config);
  const wm = await createWalletAndMidnightProvider(ctx);
  const fullProviders = attachWalletProviders(providers, wm);

  const compiled = (CompiledContract.make as any)('zk-promo', ZkPromoContract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(contractConfig.zkConfigPath),
  );
  const deployed = await (findDeployedContract as any)(fullProviders, {
    contractAddress: contractAddress as any,
    compiledContract: compiled,
    privateStateId: 'zkPromoPrivateState',
    initialPrivateState: emptyPrivateState(),
  } as any);

  await claimApi(deployed, fullProviders, code);
  console.log('\n  ✓ Redemption submitted.\n');
}

main().catch((err) => {
  console.error('\n  ✗ Claim failed:', err?.message ?? err);
  process.exit(1);
});
