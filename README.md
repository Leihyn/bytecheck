# bytecheck

**A Safe module that executes only calldata a proposer has signed, byte for byte.**

Built for the KeeperHub Agent Economy hackathon · Main track: Best Integration into a Live Project · Live project: [Safe](https://safe.global) v1.4.1 on Base Sepolia

---

## The problem

An agent that moves treasury funds does not build its own transaction. It describes one — a function name and a list of arguments — and an execution service encodes that description into calldata and broadcasts it.

Between the description and the chain, the bytes are somebody else's to choose.

That gap is not hypothetical. Here is KeeperHub, on `main`, today:

```
simulate path    lib/execute/simulate.ts:660-661
                   coerceArgsForAbi(args, fn)   →  reshapeArgsForAbi(...)

broadcast path   plugins/web3/steps/write-contract-core.ts:343-344
                 plugins/web3/steps/batch-write-contract-core.ts:298-299
                 plugins/web3/steps/read-contract-core.ts:284-285
                   reshapeArgsForAbi(args, fn) →  coerceArgsForAbi(...)
```

Three call sites agree. `simulateContractCall` is the outlier.

The order matters because `coerceTuple` returns its value untouched unless that value is already a structured object:

```ts
function coerceTuple(value, components) {
  if (!isPreStructuredObject(value)) return value;   // <- bails, pre-reshape
  ...
}
```

Before `reshapeArgsForAbi` has run, a tuple's fields are still flat in the argument array. So on the simulate path `coerceTuple` bails and never descends to the `bool` components, and `coerceBool` never fires.

KeeperHub's own comment, two functions above, says why that is harmful:

> ethers v6 encodes booleans via JS truthiness (`value ? 1 : 0`), so any non-empty string — including the literal `"false"` — becomes `true` without warning.

The coercion exists specifically to prevent `"false"` becoming `true`. The simulate path is the one that skips it.

### See it for yourself

No API key, no account, no network:

```bash
npm install
npm run divergence
```

```
Function : settle((address,bool,address,bool),uint256)
Argument : funds.fromInternalBalance = "false"  (flattened string)

simulate path   (coerce -> reshape, simulate.ts:660-661)
  0x870fbea0...0001...
broadcast path  (reshape -> coerce, write-contract-core.ts:343-344)
  0x870fbea0...0000...

identical : false

first differing word: #1
  simulate  0x...0000000000000001
  broadcast 0x...0000000000000000

  That word is funds.fromInternalBalance. The dry run encodes it TRUE;
  the broadcast encodes it FALSE. Same request body, two branches.
```

Same selector. Same length. One word apart. The dry run a treasury approved and the transaction the chain executed disagree about which branch runs.

`ts/src/divergence.ts` is a faithful reproduction of both transforms from `lib/abi/struct-args.ts`, applied in the two orders the codebase actually uses. It imports ethers v6 because that is what KeeperHub encodes with. Run against viem instead and the input is refused outright — which places the cause on the encoder's permissiveness, not on the arguments.

---

## Why a Safe module

KeeperHub already applies the right instinct in one place. Its raw-calldata route decodes the bytes, re-encodes them, and compares:

> `data` is not the canonical encoding of the call it decodes to … The transaction is built from the decoded arguments, not from the bytes sent, so trailing bytes, non-minimal offsets and non-canonical padding are refused instead of being dropped silently.

That is a parity check, and it is correct. But it guards one route. An agent using the documented `functionArgs` path gets no such check — **and a Safe cannot see which route its relayer chose.**

So the check belongs at the boundary a relayer cannot bypass: the Safe itself.

A proposer signs an EIP-712 intent that binds `keccak256(data)` — the exact bytes, not a description of them. Any relayer may submit it, including a service whose encoder disagrees. If one byte differs, the recovered signer differs, and the call reverts before the Safe moves anything.

The relayer is reduced to a courier. It cannot choose the bytes.

```
proposer ──signs keccak256(data)──┐
                                  ▼
relayer ──────submits bytes──> CalldataParityModule ──> Safe.execTransactionFromModule
   (KeeperHub, or anyone)          │
                                   └─ bytes ≠ signed bytes → revert, nothing moves
```

---

## What is here

| Path | What it is |
|---|---|
| `src/CalldataParityModule.sol` | The module. EIP-712 intents, permissionless relaying, per-Safe replay protection, deadlines, spend cap, target allowlist, malleability rejection |
| `src/SettlementTarget.sol` | A settlement endpoint shaped like Balancer's `FundManagement`, whose branch forks on a tuple-nested bool. Records which branch ran |
| `src/ISafe.sol` | The two Safe functions a module actually needs |
| `test/CalldataParityModule.t.sol` | 17 tests, including a 256-run fuzz over arbitrary byte mutations |
| `ts/src/divergence.ts` | Offline reproduction of the encoder divergence |
| `script/Deploy.s.sol` | Deploys a real Safe v1.4.1 proxy, the module, and the target |

### The two tests that are the product

```
test_relayerFlippingTupleBool_isRefused
  Proposer signs the bytes for fromInternalBalance = false.
  Relayer submits the bytes for true — the exact drift the simulate path produces.
  Same selector, same length, one word apart.
  Module refuses. Neither branch counter moves. The intent stays unspent.

test_withoutModule_driftedBytesTakeTheWrongBranch
  The counterfactual. Same drifted bytes, no module.
  The wrong branch runs and money moves.
  This is what every integration that trusts its relayer's encoder does today.
```

---

## Quick start

```bash
# contracts
forge test --offline -vv          # 17 passing

# the divergence, offline
npm install && npm run divergence
```

Deploying against a real Safe on Base Sepolia:

```bash
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
export DEPLOYER_PRIVATE_KEY=0x...
export PROPOSER_ADDRESS=0x...        # optional; defaults to the deployer

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast -vvv
```

Then, from the Safe (owner-signed `execTransaction`):

1. `enableModule(CalldataParityModule)`
2. `setProposer(safe, proposer, true)`
3. `setAllowedTarget(safe, target, true)`
4. `setSpendCap(safe, cap)`

The Safe v1.4.1 addresses in `script/Deploy.s.sol` were each confirmed present on Base Sepolia via `eth_getCode` on 2026-09-17 — `SafeProxyFactory` 6110 bytes, `SafeL2` singleton 48844 bytes.

---

## Trust model

**Proposers** are trusted to author intents. Compromising one is equivalent to compromising an agent — which the spend cap and the target allowlist bound rather than eliminate.

**Relayers are trusted with nothing.** Submission is permissionless by design. A relayer that alters, replays, or withholds an intent gains nothing it could not achieve by simply not relaying.

**Safe owners are trusted absolutely.** They enabled the module and can disable it. Configuration is gated on `msg.sender == safe`, so reaching it at all required the owner threshold.

---

## Honest status

This is a hackathon build, and the line between what has been proven and what has not matters more than the pitch.

**Verified by running it:**
- 17/17 Foundry tests pass, including the 256-run mutation fuzz
- The encoder divergence reproduces offline and deterministically
- Safe v1.4.1 contracts confirmed deployed on Base Sepolia by `eth_getCode`

**Not done:**
- **No live on-chain execution through KeeperHub.** The organization API key was unavailable before the deadline, so the module has not been exercised against a real KeeperHub relay. The deploy script and the module are ready for it; the transaction is not there, and a screenshot of one would not be either.
- Whether KeeperHub's org wallet can relay through a module and still return a `verified: true` receipt is **unproven**. If it cannot, the fallback is for KeeperHub to execute the outer transaction with the module enforcing the commitment.
- The module is unaudited. It is 262 lines and deliberately small, but small is not the same as safe.

**On the finding.** The divergence was found during a twelve-lens review of the KeeperHub codebase and re-verified against `main` on 2026-09-17. It is a correctness defect, not an exploit: it needs no attacker, only a tuple-nested bool and the platform's own documented flattened-argument convention. It has not been reported upstream at the time of writing — that is next, independent of this submission.

---

## Troubleshooting

**`Stack too deep` when compiling tests**
Foundry's default codegen runs out of stack on functions with many locals. The tests are already factored to avoid it; if you add locals to a test, extract a helper rather than enabling `via_ir`, which is considerably slower.

**`npm run divergence` prints `identical : true`**
The reproduction only diverges for a `bool` nested inside a `tuple`. A top-level bool is coerced on both paths, so it will not differ — that is the bug's actual boundary, not a broken script.

**`Invalid boolean value: "false"` from viem**
Expected. viem refuses the string; ethers accepts it. That contrast is the point, and it is reported in the script's output.

**`SafeExecutionFailed` on a call carrying native value**
The target function is not `payable`. The module surfaces the Safe's failure instead of swallowing it — see `test_valueToNonPayableFunction_surfacesFailure`.

---

## License

MIT
