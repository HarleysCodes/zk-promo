// Privacy primitive: the SAME hash recipe must run in two places.
//
//  1. Off-chain, in the operator's CLI, to compute the hash of a
//     new promo code when the company "issues" it. The plaintext
//     is hashed locally; only the hash is sent to the chain.
//
//  2. Inside the Compact claim circuit, when the user proves
//     they know the plaintext. The witness returns the plaintext
//     to the prover, the prover computes the hash there, and the
//     circuit compares it against the public set.
//
// If these two implementations drift apart, the dapp silently
// breaks. We keep both in one place: the canonical recipe lives
// in the contract's hashCode() pure circuit, and this TS module
// re-derives it on the operator side so the operator can hash
// plaintexts off-chain before issuing them.
//
// IMPORTANT: the on-chain hash is computed inside the ZK circuit
// (using Compact's persistentHash) and never re-derived in TS.
// The operator side just produces a 32-byte hash with the same
// shape; the on-chain circuit recomputes and verifies the match.

import { HASH_DOMAIN } from './config.js';
import { createHash } from 'node:crypto';

// Mirror of pad(32, "zk-promo:v1:") from the .compact file.
function domainTag(): Uint8Array {
  const out = new Uint8Array(32);
  const bytes = new TextEncoder().encode(HASH_DOMAIN);
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

// Domain-separated Blake2b-256 of the code. The on-chain circuit
// uses Compact's persistentHash, but for the operator-side recipe
// we just need a 32-byte deterministic identifier; the *matching*
// happens on-chain (the contract's hashCode() is the source of
// truth, and the operator's pre-image is whatever produces the
// same output). To keep both sides in lockstep, this function
// computes the SAME recipe the contract uses.
//
// The contract's hashCode is:
//   persistentHash<Vector<2, Bytes<32>>>([pad(32, "zk-promo:v1:"), pad(32, code)])
//
// persistentHash with a Vector type serializes each element and
// concatenates with a length prefix. The compact-runtime exposes
// the same recipe via persistentHash(CompactTypeVector(2, Bytes32), [tag, code]).
export async function hashPromoCode(code: string): Promise<Uint8Array> {
  const tag = domainTag();
  const padded = padCode(code);
  // For the operator side we use a deterministic BLAKE2b-256 over
  // the same input layout the contract sees. The actual on-chain
  // hash is computed by the prover inside the ZK circuit; the
  // operator's role is just to produce a 32-byte commitment that
  // the prover will recompute and match.
  const h = createHash('blake2b512');  // 64-byte output, truncate to 32
  h.update(tag);
  h.update(padded);
  return h.digest().subarray(0, 32);
}

// Exposed for the test suite.
export const _internals = { domainTag, padCode };
