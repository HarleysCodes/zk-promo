// Re-exports from the compiled contract module. This is the
// "public surface" that any consumer of the dapp imports from.
//
// We don't re-export the auto-generated Contract class itself
// (consumers would have to wire their own witnesses); we expose
// the type definitions and the Circuit class so the harness can
// be tested without a real chain.
export type { Ledger, Witnesses, Circuits } from '../managed/contract/index.js';
