// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ISafe} from "./ISafe.sol";

/// @title CalldataParityModule
/// @notice A Safe module that executes only calldata a proposer has signed, byte for byte.
///
/// @dev ## Why this exists
///
/// An agent that moves treasury funds does not build its own transaction. It
/// describes one — a function name and a list of arguments — and an execution
/// service encodes those into calldata and broadcasts it. Between the
/// description and the chain, the bytes are somebody else's to choose.
///
/// That gap is not hypothetical. On KeeperHub (2026-09-17, `main`),
/// `lib/execute/simulate.ts:660-661` applies `coerceArgsForAbi` before
/// `reshapeArgsForAbi`, while all three sibling call sites
/// (`write-contract-core.ts:343-344`, `batch-write-contract-core.ts:298-299`,
/// `read-contract-core.ts:284-285`) apply them in the opposite order.
/// `coerceTuple` returns early unless its value is already a structured
/// object, so on the simulate path a `bool` nested inside a tuple is never
/// coerced. Supplied as the string "false" — the platform's own documented
/// flattened-argument convention — ethers v6 encodes it by truthiness as
/// `true` in the dry run, while the broadcast path encodes `false`.
/// The dry run and the broadcast disagree about which branch the contract takes.
///
/// KeeperHub already applies the correct instinct on one path: its raw-calldata
/// route decodes, re-encodes and byte-compares, refusing non-canonical bytes
/// outright. But an agent using the documented `functionArgs` path gets no such
/// check, and a Safe cannot see which path its relayer chose.
///
/// ## What this module does
///
/// It moves the parity check to the only boundary that cannot be bypassed: the
/// Safe itself. A proposer signs an EIP-712 intent binding `keccak256(data)` —
/// the exact bytes, not a description of them. Any relayer may submit the
/// transaction, including a service whose encoder disagrees with the proposer's.
/// If a single byte differs, the recovered signer differs, and the call reverts
/// before the Safe moves anything.
///
/// The relayer is reduced to a courier. It cannot choose the bytes.
///
/// ## Trust model
///
/// - `proposers` are trusted to author intents. Compromising one is equivalent
///   to compromising an agent, which is the threat the spend cap and the target
///   allowlist bound rather than eliminate.
/// - `relayers` are trusted with nothing. Submission is permissionless by
///   design; a relayer that alters, replays, or withholds an intent gains
///   nothing it could not achieve by simply not relaying.
/// - The Safe owners are trusted absolutely — they enabled this module and can
///   disable it. `configure` is owner-gated through the Safe itself.
contract CalldataParityModule {
    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error IntentExpired(uint256 deadline, uint256 nowTs);
    error IntentAlreadyUsed(bytes32 intentId);
    error SignerNotProposer(address recovered);
    error MalleableSignature();
    error BadSignatureLength(uint256 length);
    error ZeroSigner();
    error ValueExceedsCap(uint256 value, uint256 cap);
    error TargetNotAllowed(address target);
    error ModuleNotEnabled(address safe);
    error SafeExecutionFailed(bytes32 intentId);
    error OnlySafe(address caller, address safe);

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// @dev `dataHash` is emitted so an observer can verify after the fact that
    ///      the bytes the chain saw are the bytes the proposer signed.
    event ParityExecuted(
        address indexed safe,
        bytes32 indexed intentId,
        address indexed to,
        uint256 value,
        bytes32 dataHash
    );

    event ProposerSet(address indexed safe, address indexed proposer, bool allowed);
    event TargetSet(address indexed safe, address indexed target, bool allowed);
    event SpendCapSet(address indexed safe, uint256 cap);

    // ---------------------------------------------------------------------
    // EIP-712
    // ---------------------------------------------------------------------

    bytes32 private constant _EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    /// @dev `safe` is inside the struct so an intent signed for one Safe can
    ///      never be replayed against another Safe sharing this module.
    bytes32 public constant INTENT_TYPEHASH = keccak256(
        "Intent(address safe,bytes32 intentId,address to,uint256 value,bytes32 dataHash,uint256 deadline)"
    );

    bytes32 private constant _NAME_HASH = keccak256("CalldataParityModule");
    bytes32 private constant _VERSION_HASH = keccak256("1");

    /// @dev secp256k1 curve order / 2. Signatures with `s` above this are the
    ///      mirror of a valid signature and are refused, so one intent has one
    ///      canonical signature.
    uint256 private constant _HALF_CURVE_ORDER =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @dev All configuration is keyed by Safe. One deployment serves every Safe
    ///      that enables it; no Safe can read or alter another's configuration.
    mapping(address safe => mapping(address proposer => bool)) public isProposer;
    mapping(address safe => mapping(address target => bool)) public isAllowedTarget;
    mapping(address safe => uint256 cap) public spendCap;
    mapping(address safe => mapping(bytes32 intentId => bool)) public intentUsed;

    // ---------------------------------------------------------------------
    // Configuration — callable only by the Safe itself
    // ---------------------------------------------------------------------

    /// @dev The Safe configures the module by calling into it through its own
    ///      owner-signed `execTransaction`. That makes `msg.sender == safe` the
    ///      complete authorization check: reaching here at all required the
    ///      Safe's owner threshold.
    modifier onlySafe(address safe) {
        if (msg.sender != safe) revert OnlySafe(msg.sender, safe);
        _;
    }

    function setProposer(address safe, address proposer, bool allowed) external onlySafe(safe) {
        isProposer[safe][proposer] = allowed;
        emit ProposerSet(safe, proposer, allowed);
    }

    function setAllowedTarget(address safe, address target, bool allowed) external onlySafe(safe) {
        isAllowedTarget[safe][target] = allowed;
        emit TargetSet(safe, target, allowed);
    }

    function setSpendCap(address safe, uint256 cap) external onlySafe(safe) {
        spendCap[safe] = cap;
        emit SpendCapSet(safe, cap);
    }

    // ---------------------------------------------------------------------
    // Execution
    // ---------------------------------------------------------------------

    /// @notice Execute `data` from `safe`, but only if `signature` is a proposer's
    ///         signature over these exact bytes.
    /// @dev Permissionless by design — anyone may relay. The signature, not the
    ///      caller, is the authorization.
    /// @param safe      The Safe to execute from.
    /// @param intentId  Caller-chosen unique id; replay-protected per Safe.
    /// @param to        Call target. Must be allowlisted for this Safe.
    /// @param value     Native value to send. Must not exceed this Safe's cap.
    /// @param data      The exact calldata. Its keccak256 is what the proposer signed.
    /// @param deadline  Unix timestamp after which the intent is dead.
    /// @param signature 65-byte ECDSA signature over the EIP-712 Intent struct.
    function execWithParity(
        address safe,
        bytes32 intentId,
        address to,
        uint256 value,
        bytes calldata data,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (block.timestamp > deadline) revert IntentExpired(deadline, block.timestamp);
        if (intentUsed[safe][intentId]) revert IntentAlreadyUsed(intentId);
        if (!isAllowedTarget[safe][to]) revert TargetNotAllowed(to);

        uint256 cap = spendCap[safe];
        if (value > cap) revert ValueExceedsCap(value, cap);

        // The parity check. `dataHash` commits to the bytes that will be sent —
        // not to a function name and an argument list that somebody else will
        // re-encode. A relayer whose encoder disagrees by one byte produces a
        // different hash, recovers a different address, and is refused here.
        bytes32 dataHash = keccak256(data);

        address signer = _recoverIntentSigner(safe, intentId, to, value, dataHash, deadline, signature);
        if (!isProposer[safe][signer]) revert SignerNotProposer(signer);

        if (!ISafe(safe).isModuleEnabled(address(this))) revert ModuleNotEnabled(safe);

        // Effects before interaction: the intent is burned before the Safe is
        // called, so a reentrant call carrying the same intent finds it spent.
        intentUsed[safe][intentId] = true;

        bool ok = ISafe(safe).execTransactionFromModule(to, value, data, ISafe.Operation.Call);
        if (!ok) revert SafeExecutionFailed(intentId);

        emit ParityExecuted(safe, intentId, to, value, dataHash);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(_EIP712_DOMAIN_TYPEHASH, _NAME_HASH, _VERSION_HASH, block.chainid, address(this))
        );
    }

    /// @notice The EIP-712 digest a proposer must sign for this intent.
    /// @dev Exposed so the off-chain proposer and any reviewer can derive the
    ///      same digest independently rather than trusting a client library.
    function intentDigest(
        address safe,
        bytes32 intentId,
        address to,
        uint256 value,
        bytes32 dataHash,
        uint256 deadline
    ) public view returns (bytes32) {
        bytes32 structHash =
            keccak256(abi.encode(INTENT_TYPEHASH, safe, intentId, to, value, dataHash, deadline));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _recoverIntentSigner(
        address safe,
        bytes32 intentId,
        address to,
        uint256 value,
        bytes32 dataHash,
        uint256 deadline,
        bytes calldata signature
    ) private view returns (address) {
        if (signature.length != 65) revert BadSignatureLength(signature.length);

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        // Reject the upper-range `s`. Without this, every valid signature has a
        // second form, which would let a relayer produce a distinct-looking
        // submission for an identical intent.
        if (uint256(s) > _HALF_CURVE_ORDER) revert MalleableSignature();
        if (v != 27 && v != 28) revert MalleableSignature();

        address signer = ecrecover(intentDigest(safe, intentId, to, value, dataHash, deadline), v, r, s);
        if (signer == address(0)) revert ZeroSigner();
        return signer;
    }
}
