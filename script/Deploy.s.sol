// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CalldataParityModule} from "../src/CalldataParityModule.sol";
import {SettlementTarget} from "../src/SettlementTarget.sol";

/// @notice Minimal slice of Safe's proxy factory, v1.4.1.
interface ISafeProxyFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce)
        external
        returns (address proxy);
}

/// @notice The Safe setup call, v1.4.1.
interface ISafeSetup {
    function setup(
        address[] calldata owners,
        uint256 threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;
}

/// @title Deploy
/// @notice Deploys a real Safe on Base Sepolia, then the parity module and a demo target.
///
/// @dev The Safe addresses below are the canonical v1.4.1 deployments. Each was
///      confirmed present on Base Sepolia (chain 84532) via `eth_getCode` on
///      2026-09-17 — SafeProxyFactory 6110 bytes, SafeL2 singleton 48844 bytes.
///      This is a real Safe, not a mock: the module is exercised against the
///      same contract a treasury would use.
///
///      Usage:
///        forge script script/Deploy.s.sol:Deploy \
///          --rpc-url "$BASE_SEPOLIA_RPC_URL" \
///          --private-key "$DEPLOYER_PRIVATE_KEY" \
///          --broadcast -vvv
contract Deploy is Script {
    // Safe v1.4.1 canonical addresses — verified deployed on Base Sepolia.
    address internal constant SAFE_PROXY_FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67;
    address internal constant SAFE_L2_SINGLETON = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        // The proposer is the key that signs intents. It is deliberately NOT the
        // relayer: the demo's whole point is that the relayer cannot alter bytes
        // the proposer signed.
        address proposer = vm.envOr("PROPOSER_ADDRESS", deployer);

        vm.startBroadcast(pk);

        // 1. A real Safe, owned by the deployer, threshold 1.
        address[] memory owners = new address[](1);
        owners[0] = deployer;
        bytes memory initializer = abi.encodeCall(
            ISafeSetup.setup,
            (owners, 1, address(0), "", address(0), address(0), 0, payable(address(0)))
        );
        address safe = ISafeProxyFactory(SAFE_PROXY_FACTORY).createProxyWithNonce(
            SAFE_L2_SINGLETON, initializer, uint256(blockhash(block.number - 1))
        );

        // 2. The module and the demo target.
        CalldataParityModule module = new CalldataParityModule();
        SettlementTarget target = new SettlementTarget();

        vm.stopBroadcast();

        console2.log("=== bytecheck deployment (Base Sepolia) ===");
        console2.log("deployer          ", deployer);
        console2.log("proposer          ", proposer);
        console2.log("Safe (v1.4.1)     ", safe);
        console2.log("ParityModule      ", address(module));
        console2.log("SettlementTarget  ", address(target));
        console2.log("");
        console2.log("Next, from the Safe (owner-signed execTransaction):");
        console2.log("  1. enableModule(ParityModule)");
        console2.log("  2. ParityModule.setProposer(safe, proposer, true)");
        console2.log("  3. ParityModule.setAllowedTarget(safe, target, true)");
        console2.log("  4. ParityModule.setSpendCap(safe, cap)");
    }
}
