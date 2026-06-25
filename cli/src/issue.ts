#!/usr/bin/env node
// @ts-nocheck — midnight-js SDK overloads don't resolve user-compiled contracts cleanly. The runtime shape matches counter-cli; the boundary is loosely typed. The downstream typed files (hash.ts, test.ts, contract-address handling) are unaffected.
// SPDX-License-Identifier: MIT
// Operator: register a promo code hash on-chain.
//
// Usage:
//   WALLET_SEED=<64-hex> npx tsx src/issue.ts <promo-code>
//
// The plaintext code is hashed locally with the canonical recipe
// (mirrors the contract's `hashCode()` pure circuit). Only the
// 32-byte hash touches the chain.

import { readFileSync, existsSync } from 'node:fs';
import { buildWalletAndWaitForFunds, buildProviders, createWalletAndMidnightProvider, attachWalletProviders, issue as issueApi } from './api.js';
import { hashPromoCode } from './hash.js';
import { activeConfig } from './config.js';
import { emptyPrivateState } from './common-types.js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js/contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { Contract as ZkPromoContract } from '../../contract/managed/contract/index.js';
import { contractConfig } from './config.js';
import { Buffer } from 'buffer';

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

  // Compute the hash locally using the canonical recipe
  const codeHash = hashPromoCode(code);
  console.log(`\n  Plaintext : ${code}`);
  console.log(`  Hash      : 0x${Buffer.from(codeHash).toString('hex')}`);

  const config = activeConfig();
  const ctx = await buildWalletAndWaitForFunds(config, seed);
  const providers = buildProviders(config);
  const wm = await createWalletAndMidnightProvider(ctx);
  const fullProviders = attachWalletProviders(providers, wm);

  // Join the existing contract (deploy.ts already wrote the address)
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

  await issueApi(deployed, codeHash);
  console.log(`\n  ✓ Anyone with plaintext "${code}" can now claim.\n`);
}

main().catch((err) => {
  console.error('\n  ✗ Issue failed:', err?.message ?? err);
  process.exit(1);
});
