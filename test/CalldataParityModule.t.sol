// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CalldataParityModule} from "../src/CalldataParityModule.sol";
import {ISafe} from "../src/ISafe.sol";
import {SettlementTarget} from "../src/SettlementTarget.sol";

/// @notice Minimal stand-in for a Safe, implementing only what a module touches.
/// @dev Unit tests run against this. The live demo runs against the real Safe
///      v1.4.1 singleton on Base Sepolia — see script/Deploy.s.sol.
contract MockSafe {
    mapping(address => bool) public modules;

    receive() external payable {}

    function enableModule(address m) external {
        modules[m] = true;
    }

    function disableModule(address m) external {
        modules[m] = false;
    }

    function isModuleEnabled(address m) external view returns (bool) {
        return modules[m];
    }

    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        ISafe.Operation
    ) external returns (bool success) {
        require(modules[msg.sender], "MockSafe: not a module");
        (success,) = to.call{value: value}(data);
    }

    /// @dev Lets a test act as the Safe when calling module configuration,
    ///      mirroring the real flow where owners call through `execTransaction`.
    function callModule(address module, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory ret) = module.call(data);
        require(ok, "MockSafe: module call failed");
        return ret;
    }
}

contract CalldataParityModuleTest is Test {
    CalldataParityModule internal module;
    MockSafe internal safe;
    SettlementTarget internal target;

    uint256 internal proposerPk = 0xA11CE;
    address internal proposer;
    address internal relayer = address(0xBEEF);
    address internal stranger = address(0xD00D);

    uint256 internal constant CAP = 5 ether;

    function setUp() public {
        proposer = vm.addr(proposerPk);
        module = new CalldataParityModule();
        safe = new MockSafe();
        target = new SettlementTarget();

        safe.enableModule(address(module));
        vm.deal(address(safe), 100 ether);

        _configure();
    }

    function _configure() internal {
        safe.callModule(
            address(module),
            abi.encodeCall(CalldataParityModule.setProposer, (address(safe), proposer, true))
        );
        safe.callModule(
            address(module),
            abi.encodeCall(
                CalldataParityModule.setAllowedTarget, (address(safe), address(target), true)
            )
        );
        safe.callModule(
            address(module), abi.encodeCall(CalldataParityModule.setSpendCap, (address(safe), CAP))
        );
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    function _sign(uint256 pk, bytes32 intentId, address to, uint256 value, bytes memory data, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest =
            module.intentDigest(address(safe), intentId, to, value, keccak256(data), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _settleCalldata(bool fromInternalBalance) internal view returns (bytes memory) {
        SettlementTarget.FundManagement memory funds = SettlementTarget.FundManagement({
            sender: address(safe),
            fromInternalBalance: fromInternalBalance,
            recipient: address(0xCAFE),
            toInternalBalance: false
        });
        return abi.encodeCall(SettlementTarget.settle, (funds, 1_000));
    }

    // -----------------------------------------------------------------
    // The headline property
    // -----------------------------------------------------------------

    /// @notice A relayer that flips the tuple-nested bool is refused.
    /// @dev This is the whole product in one test. The proposer signs the bytes
    ///      encoding `fromInternalBalance = false`. The relayer submits the bytes
    ///      encoding `true` — the exact drift KeeperHub's simulate path produces
    ///      when the value arrives as the string "false". One 32-byte word differs.
    ///      The module refuses it, and the Safe never executes.
    function test_relayerFlippingTupleBool_isRefused() public {
        bytes memory signedBytes = _settleCalldata(false);
        bytes memory driftedBytes = _settleCalldata(true);

        // The drift is real and it is minimal: same selector, same length, one word apart.
        assertEq(signedBytes.length, driftedBytes.length, "same length");
        assertEq(bytes4(signedBytes), bytes4(driftedBytes), "same selector");
        assertTrue(keccak256(signedBytes) != keccak256(driftedBytes), "bytes must differ");

        bytes32 intentId = keccak256("intent-drift");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(proposerPk, intentId, address(target), 0, signedBytes, deadline);

        vm.prank(relayer);
        vm.expectRevert();
        module.execWithParity(
            address(safe), intentId, address(target), 0, driftedBytes, deadline, sig
        );

        // Nothing ran. No branch counter moved.
        (uint256 internalCount, uint256 externalCount,) = target.counters();
        assertEq(internalCount, 0, "internal branch must not have run");
        assertEq(externalCount, 0, "external branch must not have run");
        assertFalse(module.intentUsed(address(safe), intentId), "intent must remain unspent");
    }

    /// @notice Without the module, the same drifted bytes execute the wrong branch.
    /// @dev The counterfactual. This is what every integration that trusts its
    ///      relayer's encoder actually does, and it is why the refusal above matters.
    function test_withoutModule_driftedBytesTakeTheWrongBranch() public {
        bytes memory driftedBytes = _settleCalldata(true);

        vm.prank(address(safe));
        (bool ok,) = address(target).call(driftedBytes);
        assertTrue(ok, "direct call succeeds");

        (uint256 internalCount, uint256 externalCount, bool lastInternal) = target.counters();
        assertEq(internalCount, 1, "internal branch ran");
        assertEq(externalCount, 0, "external branch did not run");
        assertTrue(lastInternal, "wrong branch was taken");
    }

    // -----------------------------------------------------------------
    // Happy path
    // -----------------------------------------------------------------

    function test_signedBytes_execute() public {
        bytes memory data = _settleCalldata(false);
        bytes32 intentId = keccak256("intent-ok");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(proposerPk, intentId, address(target), 0, data, deadline);

        vm.expectEmit(true, true, true, true);
        emit CalldataParityModule.ParityExecuted(
            address(safe), intentId, address(target), 0, keccak256(data)
        );

        vm.prank(relayer);
        module.execWithParity(address(safe), intentId, address(target), 0, data, deadline, sig);

        (uint256 internalCount, uint256 externalCount, bool lastInternal) = target.counters();
        assertEq(externalCount, 1, "external branch ran");
        assertEq(internalCount, 0, "internal branch did not run");
        assertFalse(lastInternal, "correct branch");
        assertTrue(module.intentUsed(address(safe), intentId), "intent burned");
    }

    function test_anyRelayerMaySubmit() public {
        bytes memory data = _settleCalldata(false);
        bytes32 intentId = keccak256("intent-any-relayer");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(proposerPk, intentId, address(target), 0, data, deadline);

        // A completely unrelated address relays. Authorization is the signature.
        vm.prank(stranger);
        module.execWithParity(address(safe), intentId, address(target), 0, data, deadline, sig);
        assertTrue(module.intentUsed(address(safe), intentId));
    }

    /// @notice A plain treasury transfer: native value, empty calldata, hits `receive()`.
    /// @dev This is the demo's first hop. Note the parity check still applies —
    ///      the proposer signs keccak256("") and a relayer that appends any byte
    ///      is refused, which is what `testFuzz_anyByteMutation_isRefused` covers.
    function test_nativeValueWithinCap_transfers() public {
        bytes memory data = "";
        bytes32 intentId = keccak256("intent-value");
        uint256 deadline = block.timestamp + 1 hours;
        uint256 value = 1 ether;
        bytes memory sig = _sign(proposerPk, intentId, address(target), value, data, deadline);

        uint256 before = address(target).balance;
        vm.prank(relayer);
        module.execWithParity(address(safe), intentId, address(target), value, data, deadline, sig);
        assertEq(address(target).balance - before, value, "value delivered");
    }

    /// @notice Native value alongside a non-payable function is refused by the target.
    /// @dev The module surfaces the Safe's failure rather than swallowing it.
    function test_valueToNonPayableFunction_surfacesFailure() public {
        bytes memory data = _settleCalldata(false);
        bytes32 intentId = keccak256("intent-value-nonpayable");
        uint256 deadline = block.timestamp + 1 hours;
        uint256 value = 1 ether;
        bytes memory sig = _sign(proposerPk, intentId, address(target), value, data, deadline);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(CalldataParityModule.SafeExecutionFailed.selector, intentId)
        );
        module.execWithParity(address(safe), intentId, address(target), value, data, deadline, sig);
    }

    // -----------------------------------------------------------------
    // Refusals
    // -----------------------------------------------------------------

    function test_replayedIntent_reverts() public {
        bytes memory data = _settleCalldata(false);
        bytes32 intentId = keccak256("intent-replay");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(proposerPk, intentId, address(target), 0, data, deadline);

        vm.prank(relayer);
        module.execWithParity(address(safe), intentId, address(target), 0, data, deadline, sig);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(CalldataParityModule.IntentAlreadyUsed.selector, intentId)
        );
        module.execWithParity(address(safe), intentId, address(target), 0, data, deadline, sig);
    }

    function test_expiredIntent_reverts() public {
        bytes memory data = _settleCalldata(false);
        bytes32 intentId = keccak256("intent-expired");
        uint256 deadline = block.timestamp + 10;
        bytes memory sig = _sign(proposerPk, intentId, address(target), 0, data, deadline);

        vm.warp(deadline + 1);
        vm.prank(relayer);
        vm.expectRevert();
        module.execWithParity(address(safe), intentId, address(target), 0, data, deadline, sig);
    }

    function test_nonProposerSignature_reverts() public {
        bytes memory data = _settleCalldata(false);
        bytes32 intentId = keccak256("intent-stranger");
        uint256 deadline = block.timestamp + 1 hours;
        uint256 strangerPk = 0xB0B;
        bytes memory sig = _sign(strangerPk, intentId, address(target), 0, data, deadline);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(
                CalldataParityModule.SignerNotProposer.selector, vm.addr(strangerPk)
            )
        );
        module.execWithParity(address(safe), intentId, address(target), 0, data, deadline, sig);
    }

    function test_valueOverCap_reverts() public {
        bytes memory data = _settleCalldata(false);
        bytes32 intentId = keccak256("intent-cap");
        uint256 deadline = block.timestamp + 1 hours;
        uint256 value = CAP + 1;
        bytes memory sig = _sign(proposerPk, intentId, address(target), value, data, deadline);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(CalldataParityModule.ValueExceedsCap.selector, value, CAP)
        );
        module.execWithParity(address(safe), intentId, address(target), value, data, deadline, sig);
    }

    function test_targetNotAllowlisted_reverts() public {
        bytes memory data = _settleCalldata(false);
        bytes32 intentId = keccak256("intent-target");
        uint256 deadline = block.timestamp + 1 hours;
        address rogue = address(0xBAD);
        bytes memory sig = _sign(proposerPk, intentId, rogue, 0, data, deadline);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(CalldataParityModule.TargetNotAllowed.selector, rogue)
        );
        module.execWithParity(address(safe), intentId, rogue, 0, data, deadline, sig);
    }

    /// @dev Mirrors a valid signature onto the upper half of the curve.
    function _malleableSig(bytes32 digest) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(proposerPk, digest);
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        return abi.encodePacked(r, bytes32(n - uint256(s)), v == 27 ? uint8(28) : uint8(27));
    }

    function test_malleableSignature_reverts() public {
        bytes memory data = _settleCalldata(false);
        bytes32 intentId = keccak256("intent-malleable");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _malleableSig(
            module.intentDigest(address(safe), intentId, address(target), 0, keccak256(data), deadline)
        );

        vm.prank(relayer);
        vm.expectRevert(CalldataParityModule.MalleableSignature.selector);
        module.execWithParity(address(safe), intentId, address(target), 0, data, deadline, sig);
    }

    function test_badSignatureLength_reverts() public {
        bytes memory data = _settleCalldata(false);
        bytes32 intentId = keccak256("intent-siglen");
        uint256 deadline = block.timestamp + 1 hours;

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(CalldataParityModule.BadSignatureLength.selector, 3));
        module.execWithParity(address(safe), intentId, address(target), 0, data, deadline, hex"010203");
    }

    function test_moduleDisabled_reverts() public {
        safe.disableModule(address(module));

        bytes memory data = _settleCalldata(false);
        bytes32 intentId = keccak256("intent-disabled");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(proposerPk, intentId, address(target), 0, data, deadline);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(CalldataParityModule.ModuleNotEnabled.selector, address(safe))
        );
        module.execWithParity(address(safe), intentId, address(target), 0, data, deadline, sig);
    }

    // -----------------------------------------------------------------
    // Configuration authorization
    // -----------------------------------------------------------------

    function test_onlySafeMayConfigure() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(CalldataParityModule.OnlySafe.selector, stranger, address(safe))
        );
        module.setProposer(address(safe), stranger, true);
    }

    function _spawnConfiguredSafe() internal returns (MockSafe s) {
        s = new MockSafe();
        s.enableModule(address(module));
        vm.deal(address(s), 10 ether);
        s.callModule(
            address(module),
            abi.encodeCall(CalldataParityModule.setProposer, (address(s), proposer, true))
        );
        s.callModule(
            address(module),
            abi.encodeCall(CalldataParityModule.setAllowedTarget, (address(s), address(target), true))
        );
        s.callModule(
            address(module), abi.encodeCall(CalldataParityModule.setSpendCap, (address(s), CAP))
        );
    }

    function test_intentIsBoundToOneSafe() public {
        address other = address(_spawnConfiguredSafe());

        // Signed for `safe`, replayed against `other`.
        bytes memory data = _settleCalldata(false);
        bytes32 intentId = keccak256("intent-cross-safe");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(proposerPk, intentId, address(target), 0, data, deadline);

        vm.prank(relayer);
        vm.expectRevert();
        module.execWithParity(other, intentId, address(target), 0, data, deadline, sig);
    }

    // -----------------------------------------------------------------
    // Fuzz
    // -----------------------------------------------------------------

    /// @notice Any mutation of the signed bytes is refused.
    function testFuzz_anyByteMutation_isRefused(uint256 wordIndex, bytes32 mutation) public {
        bytes memory data = _settleCalldata(false);
        vm.assume(mutation != bytes32(0));

        bytes32 intentId = keccak256("intent-fuzz");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(proposerPk, intentId, address(target), 0, data, deadline);

        // Mutate one 32-byte word of the argument area (skip the 4-byte selector).
        uint256 words = (data.length - 4) / 32;
        vm.assume(words > 0);
        uint256 idx = wordIndex % words;

        // `bytes memory mutated = data` would alias the same memory, so mutating
        // it would mutate `data` too and the two hashes could never differ.
        // bytes.concat forces a genuine copy.
        bytes memory mutated = bytes.concat(data);
        assembly {
            let p := add(add(mutated, 32), add(4, mul(idx, 32)))
            mstore(p, xor(mload(p), mutation))
        }
        assertTrue(keccak256(mutated) != keccak256(data), "mutation must change the bytes");

        vm.prank(relayer);
        vm.expectRevert();
        module.execWithParity(address(safe), intentId, address(target), 0, mutated, deadline, sig);
    }
}
