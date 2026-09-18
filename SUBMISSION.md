# DoraHacks submission — bytecheck

**Hackathon:** KeeperHub — The Agent Economy
**Track:** Main — Best Integration into a Live Project ($4,000)
**Live project integrated:** Safe (v1.4.1, Base Sepolia)

Copy-paste fields below.

---

## Project name

```
bytecheck
```

## Tagline (short)

```
Sign the bytes, not the description.
```

## One-liner

```
A Safe module that executes only calldata a proposer has signed, byte for byte — so a relayer whose encoder disagrees is refused before the Safe moves anything.
```

## GitHub

```
https://github.com/Leihyn/bytecheck
```

## Demo video

```
<PASTE YOUTUBE/LOOM URL AFTER UPLOAD — file is at video/out/demo.mp4>
```

---

## Description

```
An agent that moves treasury funds does not build its own transaction. It describes
one — a function name and a list of arguments — and an execution service encodes that
description into calldata and broadcasts it. Between the description and the chain,
the bytes are somebody else's to choose.

That gap is not hypothetical. On KeeperHub `main`, lib/execute/simulate.ts:660-661
applies coerceArgsForAbi before reshapeArgsForAbi, while all three sibling call sites
(write-contract-core.ts:343-344, batch-write-contract-core.ts:298-299,
read-contract-core.ts:284-285) apply them in the opposite order. coerceTuple returns
early unless its value is already a structured object, so on the simulate path a bool
nested inside a tuple is never coerced. Supplied as the string "false" — KeeperHub's
own documented flattened-argument convention — ethers v6 encodes it by truthiness as
true in the dry run, while the broadcast encodes false. The dry run a treasury
approved and the transaction the chain executed disagree about which branch runs.

`npm run divergence` reproduces this offline in about a second: same request body, same
selector, same length, differing at word #1. No API key, no network. viem refuses the
same input outright, which places the cause on the encoder's permissiveness rather
than on the arguments.

KeeperHub already applies the right instinct in one place — its raw-calldata route
decodes, re-encodes and byte-compares, refusing non-canonical bytes. But that guards
one route, and a Safe cannot see which route its relayer chose.

So bytecheck moves the check to the boundary a relayer cannot bypass: the Safe itself.
A proposer signs an EIP-712 intent binding keccak256(data) — the exact bytes, not a
description of them. Any relayer may submit, including one whose encoder disagrees. If
a single byte differs, the recovered signer differs and the call reverts before the
Safe moves anything. The relayer is reduced to a courier.

The module is 262 lines: EIP-712 intents, permissionless relaying, per-Safe replay
protection, deadlines, a spend cap, a target allowlist, signature-malleability
rejection, and effects-before-interaction ordering. 17 Foundry tests pass, including a
256-run fuzz proving any byte mutation is refused. Two of them are the product: one
signs the bytes for false and submits the bytes for true (exactly the drift the
simulate path produces) and shows the module refusing; the other is the counterfactual,
where the same drifted bytes with no module run the wrong branch and move money.

Honest status: there is no live KeeperHub execution. The organization API key was
unavailable before the deadline, so the module has not been exercised against a real
relay, and a screenshot of a transaction would not be a transaction. What is verified
is verified by running it. What is not is stated plainly in the README and in the video.
```

## KeeperHub surfaces used

```
- Direct Execution API semantics: simulate -> deterministic idempotency key ->
  broadcast once -> verified receipt (the acceptance protocol the module is designed
  to sit behind)
- The argument-transform pipeline in lib/abi/struct-args.ts, reproduced faithfully
  offline in ts/src/divergence.ts
- The raw-calldata route's decode/re-encode/byte-compare parity check, cited as the
  in-house precedent the module generalizes
- Safe v1.4.1 on Base Sepolia as the live integration target
```

## What is verified vs not

```
VERIFIED (by running it, 2026-09-17/18):
  - 17/17 Foundry tests pass, including a 256-run mutation fuzz
  - The encoder divergence reproduces offline and deterministically
  - Safe v1.4.1 confirmed deployed on Base Sepolia via eth_getCode:
      SafeProxyFactory  0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67  (6110 bytes)
      SafeL2 singleton  0x29fcB43b46531BcA003ddC8FCB67FFE91900C762  (48844 bytes)
      Safe singleton    0x41675C099F32341bf84BFc5382aF534df5C7461a  (47160 bytes)
      MultiSend         0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526  (1260 bytes)

NOT DONE:
  - No live KeeperHub execution (org API key unavailable before the deadline)
  - Whether a module-relayed execution returns a KeeperHub verified:true receipt
    is unproven; the fallback design is documented
  - The module is unaudited
```

---

## Submission checklist

- [x] Public GitHub repo — https://github.com/Leihyn/bytecheck
- [x] README explaining the problem, the mechanism, and honest status
- [x] Tests passing and reproducible (`forge test --offline`)
- [x] Offline reproduction of the finding (`npm run divergence`)
- [ ] Demo video uploaded and URL pasted above
- [ ] Submitted on DoraHacks before 2026-09-18 11:00 WAT

## Post-submission, independent of the result

- [ ] Report the simulate/broadcast ordering divergence upstream to KeeperHub as an
      issue, with the offline reproduction. It is a real correctness defect in a
      guarantee they advertise, and it should be fixed whether or not this places.
- [ ] Decide disclosure on the remaining security findings, including the Critical in
      the x402 payment path, which has been undisclosed since 2026-09-01.
