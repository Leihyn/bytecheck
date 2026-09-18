// GAP MODE — TTS narration at 1.0x with a silent gap after each clip.
export const FPS = 30;
export const W = 1920;
export const H = 1080;

export const PACING_MODE = "gap" as const;
export const PLAYBACK_RATE = 1.0;

// Security archetype theme.
export const COLORS = {
  bg: "#050a14",
  bgCard: "rgba(10,18,30,0.7)",
  bgCardStrong: "rgba(10,18,30,0.92)",
  accent: "#3b82f6",
  accentDim: "#1e3a5f",
  accentBright: "#60a5fa",
  accentGlow: "rgba(59,130,246,0.15)",
  white: "#f0f5ff",
  offWhite: "#a0b0c8",
  muted: "#4a5a6e",
  border: "rgba(59,130,246,0.2)",
  borderStrong: "rgba(59,130,246,0.45)",
  red: "#ef4444",
  amber: "#f59e0b",
  green: "#3fb950",
  cyan: "#22d3ee",
};

export const TERMINAL = {
  bg: "#050d16",
  text: "#c9d5e3",
  green: "#3fb950",
  yellow: "#d29922",
  red: "#f85149",
  blue: "#58a6ff",
  purple: "#bc8cff",
  prompt: "#8b949e",
};

export const SCENE_GAP = Math.round(1.5 * FPS);

// Measured with ffprobe on the generated narration.
export const AUDIO_DURATIONS = {
  s1: 465,
  s2: 848,
  s3: 748,
  s4: 773,
  s5: 878,
  s6: 693,
} as const;

export const SCENE_DURATIONS = {
  s1: AUDIO_DURATIONS.s1 + SCENE_GAP,
  s2: AUDIO_DURATIONS.s2 + SCENE_GAP,
  s3: AUDIO_DURATIONS.s3 + SCENE_GAP,
  s4: AUDIO_DURATIONS.s4 + SCENE_GAP,
  s5: AUDIO_DURATIONS.s5 + SCENE_GAP,
  s6: AUDIO_DURATIONS.s6 + SCENE_GAP,
} as const;

export const CROSSFADE = 15;

export const TOTAL_FRAMES =
  Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0) -
  CROSSFADE * (Object.keys(SCENE_DURATIONS).length - 1);

export const AUDIO_FILES: Record<keyof typeof AUDIO_DURATIONS, string> = {
  s1: "audio/s1.mp3",
  s2: "audio/s2.mp3",
  s3: "audio/s3.mp3",
  s4: "audio/s4.mp3",
  s5: "audio/s5.mp3",
  s6: "audio/s6.mp3",
};

export const SCENE_ORDER = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;

export const BRAND = {
  name: "bytecheck",
  tagline: "Sign the bytes, not the description.",
  repo: "github.com/Leihyn/bytecheck",
  event: "KeeperHub — The Agent Economy",
};

// --- Scene 2: the ordering contrast. Real file paths and line numbers. ---
export const ORDER_BROADCAST = [
  { file: "plugins/web3/steps/write-contract-core.ts", line: "343-344" },
  { file: "plugins/web3/steps/batch-write-contract-core.ts", line: "298-299" },
  { file: "plugins/web3/steps/read-contract-core.ts", line: "284-285" },
];

export const ORDER_SIMULATE = {
  file: "lib/execute/simulate.ts",
  line: "660-661",
};

export const COERCE_TUPLE_SNIPPET = [
  "function coerceTuple(value, components) {",
  "  if (!isPreStructuredObject(value)) return value;",
  "  // ...",
  "}",
];

export const KEEPERHUB_COMMENT =
  "ethers v6 encodes booleans via JS truthiness, so any non-empty string — including the literal \"false\" — becomes true without warning.";

// --- Scene 3: verbatim stdout from `npm run divergence`. ---
export const DIVERGENCE_LINES: { text: string; color?: string }[] = [
  { text: "$ npm run divergence", color: TERMINAL.prompt },
  { text: "" },
  { text: "Function : settle((address,bool,address,bool),uint256)", color: TERMINAL.text },
  { text: 'Argument : funds.fromInternalBalance = "false"', color: TERMINAL.text },
  { text: "" },
  { text: "simulate path   (coerce -> reshape, simulate.ts:660-661)", color: TERMINAL.blue },
  { text: "  0x870fbea0...0000000000000001...", color: TERMINAL.red },
  { text: "broadcast path  (reshape -> coerce, write-contract-core.ts:343)", color: TERMINAL.blue },
  { text: "  0x870fbea0...0000000000000000...", color: TERMINAL.green },
  { text: "" },
  { text: "identical : false", color: TERMINAL.red },
  { text: "" },
  { text: "first differing word: #1", color: TERMINAL.yellow },
  { text: "  simulate  0x...0000000000000001", color: TERMINAL.red },
  { text: "  broadcast 0x...0000000000000000", color: TERMINAL.green },
  { text: "" },
  { text: "  ethers v6 encoded \"false\" as true.", color: TERMINAL.yellow },
  { text: "  viem refused it — Invalid boolean value: \"false\"", color: TERMINAL.purple },
];

// --- Scene 5: verbatim stdout from `forge test --offline`. ---
export const TEST_LINES: { text: string; color?: string }[] = [
  { text: "$ forge test --offline", color: TERMINAL.prompt },
  { text: "" },
  { text: "[PASS] testFuzz_anyByteMutation_isRefused (runs: 256)", color: TERMINAL.green },
  { text: "[PASS] test_relayerFlippingTupleBool_isRefused", color: TERMINAL.green },
  { text: "[PASS] test_withoutModule_driftedBytesTakeTheWrongBranch", color: TERMINAL.green },
  { text: "[PASS] test_signedBytes_execute", color: TERMINAL.green },
  { text: "[PASS] test_anyRelayerMaySubmit", color: TERMINAL.green },
  { text: "[PASS] test_replayedIntent_reverts", color: TERMINAL.green },
  { text: "[PASS] test_malleableSignature_reverts", color: TERMINAL.green },
  { text: "[PASS] test_intentIsBoundToOneSafe", color: TERMINAL.green },
  { text: "[PASS] test_valueOverCap_reverts", color: TERMINAL.green },
  { text: "[PASS] test_targetNotAllowlisted_reverts", color: TERMINAL.green },
  { text: "  ... 7 more", color: TERMINAL.prompt },
  { text: "" },
  { text: "Suite result: ok. 17 passed; 0 failed; 0 skipped", color: TERMINAL.green },
  { text: "finished in 76.94ms", color: TERMINAL.prompt },
];

// --- Scene 6: honest status board. ---
export const STATUS_PROVEN = [
  "17/17 Foundry tests, incl. 256-run mutation fuzz",
  "Encoder divergence reproduces offline, deterministically",
  "Safe v1.4.1 confirmed on Base Sepolia via eth_getCode",
];

export const STATUS_NOT = [
  "No live KeeperHub execution — org API key unavailable",
  "Module-relayed verified receipt: unproven",
  "Unaudited. 262 lines, but small is not safe",
];

// --- Subtitles: scene-local frames. GAP mode -> frame = round(seconds * FPS). ---
export const SUBTITLES = {
  s1: [
    { text: "An agent that moves treasury funds does not build its own transaction.", start: 0, end: 135 },
    { text: "It describes one. A function name, a list of arguments.", start: 135, end: 255 },
    { text: "Something else turns that description into bytes and sends it.", start: 255, end: 360 },
    { text: "Between the description and the chain, the bytes are somebody else's to choose.", start: 360, end: 465 },
  ],
  s2: [
    { text: "Here is KeeperHub, on main, today.", start: 0, end: 90 },
    { text: "The simulate path applies coerce, then reshape.", start: 90, end: 195 },
    { text: "All three sibling call sites do the reverse.", start: 195, end: 290 },
    { text: "coerceTuple returns early unless its value is already a structured object.", start: 290, end: 470 },
    { text: "Before reshape has run, a tuple's fields are still flat.", start: 470, end: 590 },
    { text: "So coerce never reaches the bool inside it.", start: 590, end: 680 },
    { text: "Ethers encodes booleans by truthiness, so the string false becomes true.", start: 680, end: 848 },
  ],
  s3: [
    { text: "This runs offline. No API key, no network.", start: 0, end: 110 },
    { text: "The same request body, encoded down both paths.", start: 110, end: 215 },
    { text: "Same selector. Same length. Word one differs.", start: 215, end: 330 },
    { text: "The dry run encodes the flag as true. The broadcast encodes it as false.", start: 330, end: 490 },
    { text: "A treasury approved one branch, and the chain ran the other.", start: 490, end: 610 },
    { text: "Viem refuses the same input outright.", start: 610, end: 748 },
  ],
  s4: [
    { text: "KeeperHub already got this right in one place.", start: 0, end: 105 },
    { text: "Its raw calldata route decodes, re-encodes, and refuses anything non canonical.", start: 105, end: 280 },
    { text: "But a Safe cannot see which route its relayer chose.", start: 280, end: 400 },
    { text: "So the check moves to the Safe.", start: 400, end: 470 },
    { text: "The proposer signs a hash of the exact bytes. Any relayer may submit.", start: 470, end: 610 },
    { text: "One byte different means a revert before anything moves.", start: 610, end: 710 },
    { text: "The relayer becomes a courier.", start: 710, end: 773 },
  ],
  s5: [
    { text: "Seventeen tests, all passing, including a fuzz over arbitrary byte mutations.", start: 0, end: 175 },
    { text: "Two of them are the product.", start: 175, end: 240 },
    { text: "The first signs the bytes for false, then submits the bytes for true.", start: 240, end: 400 },
    { text: "The module refuses. Neither branch counter moves.", start: 400, end: 510 },
    { text: "The second is the counterfactual. Same drifted bytes, no module.", start: 510, end: 650 },
    { text: "The wrong branch runs, and money moves.", start: 650, end: 745 },
    { text: "That is what every integration trusting its relayer's encoder does today.", start: 745, end: 878 },
  ],
  s6: [
    { text: "What is proven here is the contract, the tests, and the divergence.", start: 0, end: 150 },
    { text: "What is not, is a live KeeperHub execution.", start: 150, end: 250 },
    { text: "The organization key was unavailable before the deadline.", start: 250, end: 370 },
    { text: "So there is no transaction hash.", start: 370, end: 445 },
    { text: "The module is ready for it. The finding goes upstream regardless.", start: 445, end: 600 },
    { text: "bytecheck. Sign the bytes, not the description.", start: 600, end: 693 },
  ],
} as const;
