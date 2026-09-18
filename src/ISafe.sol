// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice The subset of the Safe (v1.4.1) interface this module depends on.
/// @dev Deliberately minimal. A module only ever needs to (a) ask the Safe to
///      execute, and (b) ask the Safe whether it is enabled. Importing the full
///      Safe source would pull a large dependency tree for two functions.
interface ISafe {
    enum Operation {
        Call,
        DelegateCall
    }

    /// @notice Executes a transaction from an enabled module, bypassing owner signatures.
    /// @dev This is the entire reason module security matters: there is no second
    ///      approval behind it. Whatever bytes a module passes here, the Safe sends.
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        Operation operation
    ) external returns (bool success);

    /// @notice True when `module` is enabled on this Safe.
    function isModuleEnabled(address module) external view returns (bool);
}
