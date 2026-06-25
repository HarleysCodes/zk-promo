// Privacy primitive: the SAME hash recipe must run in two places.
//
//  1. Off-chain, in the operator's CLI, to compute the hash of a
//     new promo code when the company "issues" it. The plaintext
//     is hashed locally; only the hash is sent to the chain.
//
//  2. Inside the Compact claim circuit, when the user proves
//     they know the plaintext. The witness returns the plaintext
//     to the prover, the prover hashes it there, and the
//     circuit compares it against the public set.
//
// If these two implementations drift apart, the dapp silently
// breaks. The canonical recipe lives in the contract's hashCode()
// pure circuit:
//
//   pure circuit hashCode(code: Bytes<32>): Bytes<32> {
//     return persistentHash<Vector<2, Bytes<32>>>([
//       pad(32, "zk-promo:v1:"),
//       code
//     ]);
//   }
//
// This TS module re-derives that EXACT recipe using the
// compact-runtime's persistentHash. Both sides produce identical
// 32-byte outputs for any given input, so:
//   - operator: hashPromoCode(code) -> bytes32
//   - on-chain: hashCode(plaintext) -> bytes32  (must match)
//   - claim(): checks validCodes.member(dh) where dh = hashCode(plaintext)

import { HASH_DOMAIN, REDEMPTION_DOMAIN } from './config.js';
import { persistentHash, Bytes32Descriptor, CompactTypeVector } from '@midnight-ntwrk/compact-runtime';

// Mirror of pad(32, "zk-promo:v1:") from the .compact file.
function domainTag(): Uint8Array {
  const out = new Uint8Array(32);
  const bytes = new TextEncoder().encode(HASH_DOMAIN);
  out.set(bytes.slice(0, 32), 0);
  return out;
}

// Mirror of pad(32, "zk-promo:redeem:v1:") from the .compact file.
function redemptionDomainTag(): Uint8Array {
  const out = new Uint8Array(32);
  const bytes = new TextEncoder().encode(REDEMPTION_DOMAIN);
  out.set(bytes.slice(0, 32), 0);
  return out;
}

// Mirror of pad(32, code) in Compact: zero-pad right.
function padCode(code: string): Uint8Array {
  if (code.length === 0) throw new Error('empty promo code');
  if (code.length > 32) throw new Error('promo code too long (max 32 bytes)');
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(code), 0);
  return out;
}

// Mirrors the contract's pure circuit hashCode(code):
//   persistentHash<Vector<2, Bytes<32>>>([pad(32, "zk-promo:v1:"), pad(32, code)])
//
// We call compact-runtime's persistentHash with the exact same Vector
// type and the same two bytes32 inputs, so the output is byte-for-byte
// identical to what the on-chain circuit will compute in the prover.
export function hashPromoCode(code: string): Uint8Array {
  const tag = domainTag();
  const padded = padCode(code);
  const vec = new CompactTypeVector(2, Bytes32Descriptor);
  return persistentHash(vec, [tag, padded]);
}

// Mirrors the contract's pure circuit hashRedemption(secret):
//   persistentHash<Vector<2, Bytes<32>>>([pad(32, "zk-promo:redeem:v1:"), secret])
//
// The secret must be exactly 32 bytes — there is no padding, no
// truncation. The secret is high-entropy (caller is expected to use
// crypto.getRandomValues or equivalent). The output is the same
// 32-byte hash the on-chain claimRedemption() circuit will compute.
export function hashRedemption(secret: Uint8Array): Uint8Array {
  if (secret.length !== 32) throw new Error('redemption secret must be exactly 32 bytes');
  const tag = redemptionDomainTag();
  const vec = new CompactTypeVector(2, Bytes32Descriptor);
  return persistentHash(vec, [tag, secret]);
}

/** Generate a cryptographically random 32-byte redemption secret. */
export function generateRedemptionSecret(): Uint8Array {
  const secret = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(secret);
  } else {
    // Fallback for environments without crypto.getRandomValues.
    // Node 20+ always has crypto.getRandomValues; this branch
    // exists only for TypeScript shape and any future browser-polyfill
    // scenarios.
    for (let i = 0; i < 32; i++) secret[i] = Math.floor(Math.random() * 256);
  }
  return secret;
}

// Exposed for the test suite.
export const _internals = { domainTag, padCode, redemptionDomainTag };
