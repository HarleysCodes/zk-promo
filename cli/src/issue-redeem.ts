#!/usr/bin/env node
// @ts-nocheck — midnight-js SDK overloads don't resolve user-compiled contracts cleanly. The runtime shape matches counter-cli; the boundary is loosely typed. The downstream typed files (hash.ts, test.ts, contract-address handling) are unaffected.
// SPDX-License-Identifier: MIT
// Operator: register a high-entropy redemption hash on-chain.
// Prints the 32-byte plaintext secret to stdout so the operator can
// hand it to the recipient (out-of-band: print, email, receipt, etc.).
//
// Usage:
//   WALLET_SEED=<64-hex> npx tsx src/issue-redeem.ts
//   WALLET_SEED=<64-hex> npx tsx src/issue-redeem.ts --secret <64-hex>
//
// If no --secret is passed, a fresh 32-byte secret is generated
// cryptographically (crypto.getRandomValues). The plaintext secret
// is shown once — the operator is responsible for delivering it to
// the recipient through a channel of their choice.

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { buildWalletAndWaitForFunds, buildProviders, createWalletAndMidnightProvider, attachWalletProviders, issueRedemption as issueRedemptionApi } from './api.js';
import { hashRedemption, generateRedemptionSecret } from './hash.js';
import { activeConfig, contractConfig } from './config.js';
import { emptyPrivateState } from './common-types.js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js/contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { Contract as ZkPromoContract } from '../../contract/managed/contract/index.js';
import { Buffer } from 'buffer';

const ADDR_FILE = 'contract-address.txt';
const SECRETS_LOG = 'redemption-secrets.log';

async function main() {
  const seed = process.env.WALLET_SEED;
  if (!seed) {
    console.error('  ✗ WALLET_SEED env var required (32 bytes hex).');
    process.exit(1);
  }
  if (!existsSync(ADDR_FILE)) {
    console.error(`  ✗ ${ADDR_FILE} not found. Run deploy.ts first.`);
    process.exit(1);
  }
  const contractAddress = readFileSync(ADDR_FILE, 'utf8').trim();

  // Accept an optional --secret <64-hex> for reproducibility; otherwise
  // generate a fresh 32-byte random secret.
  const args = process.argv.slice(2);
  const secretIdx = args.indexOf('--secret');
  let secret: Uint8Array;
  if (secretIdx >= 0 && args[secretIdx + 1]) {
    const hex = args[secretIdx + 1];
    if (hex.length !== 64) {
      console.error('  ✗ --secret must be 64 hex chars (32 bytes).');
      process.exit(1);
    }
    secret = Buffer.from(hex, 'hex');
  } else {
    secret = generateRedemptionSecret();
  }

  const redeemHash = hashRedemption(secret);
  const secretHex = '0x' + Buffer.from(secret).toString('hex');
  const hashHex = '0x' + Buffer.from(redeemHash).toString('hex');

  console.log(`\n  Secret    : ${secretHex}  ← deliver this to the recipient`);
  console.log(`  Hash      : ${hashHex}  ← what goes on-chain\n`);

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

  await issueRedemptionApi(deployed, redeemHash);

  // Append the secret to a local log so the operator has a record of
  // what was issued. In production this should be replaced by a proper
  // secrets-management system; the log file is gitignored.
  const logLine = `${new Date().toISOString()}  ${hashHex}  ${secretHex}\n`;
  writeFileSync(SECRETS_LOG, logLine, { flag: 'a', encoding: 'utf8' });
  console.log(`\n  ✓ Appended to ${SECRETS_LOG} (gitignored).\n`);
}

main().catch((err) => {
  console.error('\n  ✗ Issue redemption failed:', err?.message ?? err);
  process.exit(1);
});