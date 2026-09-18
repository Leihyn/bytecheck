/**
 * Reproduces the KeeperHub simulate/broadcast calldata divergence, offline.
 *
 * This is a faithful reproduction of the two argument transforms in
 * `lib/abi/struct-args.ts` on KeeperHub `main` as of 2026-09-17, applied in the
 * two orders the codebase actually uses:
 *
 *   simulate path   lib/execute/simulate.ts:660-661
 *                     coerceArgsForAbi(args, fn)   then reshapeArgsForAbi(...)
 *
 *   broadcast path  plugins/web3/steps/write-contract-core.ts:343-344
 *                   plugins/web3/steps/batch-write-contract-core.ts:298-299
 *                   plugins/web3/steps/read-contract-core.ts:284-285
 *                     reshapeArgsForAbi(args, fn) then coerceArgsForAbi(...)
 *
 * Three call sites agree. `simulateContractCall` is the outlier.
 *
 * Why the order matters: `coerceTuple` returns its value untouched unless that
 * value is already a structured object. Before `reshapeArgsForAbi` has run, a
 * tuple's fields are still flat in the argument array, so `coerceTuple` bails
 * and never descends to the `bool` components. `coerceBool` never fires.
 *
 * Why that is harmful: KeeperHub's own comment in `struct-args.ts` says it.
 * ethers v6 encodes booleans by truthiness, so any non-empty string — including
 * the literal "false" — becomes `true`. The coercion exists specifically to stop
 * that, and the simulate path skips it.
 *
 * Run: npx tsx ts/src/divergence.ts
 * No API key, no network, no KeeperHub account required.
 */

import { Interface } from "ethers";
import { encodeAbiParameters } from "viem";

// ---------------------------------------------------------------------------
// The two transforms, reproduced from lib/abi/struct-args.ts
// ---------------------------------------------------------------------------

type AbiParam = { name: string; type: string; components?: AbiParam[] };

const TEMPLATE_VARIABLE_RE = /^\{\{.+\}\}$/;

function isTupleInput(input: AbiParam): boolean {
  return input.type === "tuple" && input.components !== undefined && input.components.length > 0;
}

function isPreStructuredObject(arg: unknown): boolean {
  return arg !== null && typeof arg === "object" && !Array.isArray(arg);
}

function isTemplateVariable(value: unknown): boolean {
  return typeof value === "string" && TEMPLATE_VARIABLE_RE.test(value);
}

/** Rebuilds flat args into the objects ethers expects for tuple params. */
function reshapeArgsForAbi(args: unknown[], inputs: AbiParam[]): unknown[] {
  if (args.length === 0 || !inputs.some(isTupleInput)) return args;

  const out: unknown[] = [];
  let cursor = 0;
  for (const input of inputs) {
    if (!isTupleInput(input)) {
      out.push(args[cursor++]);
      continue;
    }
    const components = input.components!;
    const candidate = args[cursor];
    if (isPreStructuredObject(candidate)) {
      out.push(candidate);
      cursor += 1;
      continue;
    }
    const obj: Record<string, unknown> = {};
    for (const comp of components) obj[comp.name] = args[cursor++];
    out.push(obj);
  }
  return out;
}

/**
 * Coerces stringly-typed args to their ABI-native types.
 * Scoped to `bool` on purpose — every other leaf type fails loudly on a
 * malformed string, so coercing them would hide errors instead of fixing them.
 */
function coerceArgsForAbi(args: unknown[], inputs: AbiParam[]): unknown[] {
  return args.map((arg, i) => {
    const input = inputs[i];
    if (!input) return arg;
    return coerceValue(arg, input.type, input.components);
  });
}

function coerceValue(value: unknown, type: string, components?: AbiParam[]): unknown {
  if (isTemplateVariable(value)) return value;
  if (/\[\d*\]$/.test(type)) {
    if (!Array.isArray(value)) return value;
    const elementType = type.replace(/\[\d*\]$/, "");
    return value.map((item) => coerceValue(item, elementType, components));
  }
  if (type === "tuple") return coerceTuple(value, components);
  if (type === "bool") return coerceBool(value);
  return value;
}

/** THE LOAD-BEARING LINE: returns early unless the tuple is already an object. */
function coerceTuple(value: unknown, components?: AbiParam[]): unknown {
  if (!isPreStructuredObject(value)) return value; // <- never descends, pre-reshape
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = { ...obj };
  for (const comp of components ?? []) {
    out[comp.name] = coerceValue(obj[comp.name], comp.type, comp.components);
  }
  return out;
}

function coerceBool(value: unknown): unknown {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return value;
  const v = value.trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return value;
}

// ---------------------------------------------------------------------------
// The demonstration
// ---------------------------------------------------------------------------

const SETTLE_ABI = [
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "funds",
        type: "tuple",
        components: [
          { name: "sender", type: "address" },
          { name: "fromInternalBalance", type: "bool" },
          { name: "recipient", type: "address" },
          { name: "toInternalBalance", type: "bool" },
        ],
      },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
];

const INPUTS = SETTLE_ABI[0].inputs as unknown as AbiParam[];

/**
 * ethers v6, as KeeperHub uses. Its BooleanCoder is `!value ? 0 : 1`, so any
 * non-empty string — including "false" — encodes as true, without warning.
 * That permissiveness is what makes the ordering bug reachable.
 */
const IFACE = new Interface(SETTLE_ABI);

/**
 * The agent's arguments, flattened to strings — KeeperHub's own documented
 * convention for protocol step handlers. `fromInternalBalance` is "false":
 * the agent is asking for a real external transfer.
 */
const FLAT_ARGS: unknown[] = [
  "0x1111111111111111111111111111111111111111", // funds.sender
  "false", // funds.fromInternalBalance  <-- the argument in question
  "0x2222222222222222222222222222222222222222", // funds.recipient
  "false", // funds.toInternalBalance
  "1000", // amount
];

function encodeVia(order: "simulate" | "broadcast"): string {
  let args: unknown[];
  if (order === "simulate") {
    // simulate.ts:660-661 — coerce first, then reshape.
    args = reshapeArgsForAbi(coerceArgsForAbi(FLAT_ARGS, INPUTS), INPUTS);
  } else {
    // write-contract-core.ts:343-344 — reshape first, then coerce.
    args = coerceArgsForAbi(reshapeArgsForAbi(FLAT_ARGS, INPUTS), INPUTS);
  }
  return IFACE.encodeFunctionData("settle", args);
}

/** Would a strict encoder have caught this? Reported alongside the result. */
function viemVerdict(): string {
  try {
    encodeAbiParameters(
      [{ type: "bool" }],
      ["false" as unknown as boolean]
    );
    return "accepted it (no help)";
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return `refused it — ${msg}`;
  }
}

function word(data: string, index: number): string {
  const body = data.slice(10); // strip 0x + 4-byte selector
  return body.slice(index * 64, (index + 1) * 64);
}

function main(): void {
  const simulated = encodeVia("simulate");
  const broadcast = encodeVia("broadcast");

  console.log("KeeperHub simulate/broadcast calldata divergence");
  console.log("=================================================\n");
  console.log("Function : settle((address,bool,address,bool),uint256)");
  console.log("Argument : funds.fromInternalBalance = \"false\"  (flattened string)\n");

  console.log("simulate path   (coerce -> reshape, simulate.ts:660-661)");
  console.log(" ", simulated, "\n");
  console.log("broadcast path  (reshape -> coerce, write-contract-core.ts:343-344)");
  console.log(" ", broadcast, "\n");

  const differs = simulated !== broadcast;
  console.log("identical :", !differs);

  if (differs) {
    const total = (simulated.length - 10) / 64;
    for (let i = 0; i < total; i++) {
      const a = word(simulated, i);
      const b = word(broadcast, i);
      if (a !== b) {
        console.log(`\nfirst differing word: #${i}`);
        console.log("  simulate  0x" + a);
        console.log("  broadcast 0x" + b);
        console.log(
          "\n  That word is funds.fromInternalBalance. The dry run encodes it TRUE;"
        );
        console.log("  the broadcast encodes it FALSE. Same request body, two branches.");
        break;
      }
    }
    console.log(`\n  Encoder note: ethers v6 encoded "false" as true.`);
    console.log(`  A strict encoder (viem) ${viemVerdict()}`);
    console.log("\nA Safe cannot see which path its relayer took.");
    console.log("CalldataParityModule makes the relayer prove it: the proposer signs");
    console.log("keccak256(data), so either set of bytes is refused unless it is the");
    console.log("exact set that was signed.");
    process.exitCode = 0;
  } else {
    console.log("\nNo divergence reproduced against this ABI shape.");
    process.exitCode = 1;
  }
}

main();
