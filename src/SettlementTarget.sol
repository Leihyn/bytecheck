// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title SettlementTarget
/// @notice A settlement endpoint whose behaviour forks on a bool nested inside a
///         struct parameter.
///
/// @dev The shape is deliberately ordinary. `FundManagement` mirrors Balancer
///      V2's struct of the same name — two addresses and two booleans deciding
///      whether funds move through internal credit or a real external transfer.
///      Uniswap's `ExactInputSingleParams`, and any router carrying
///      `unwrapWETH` / `zeroForOne` / `isNative` flags, have the same property:
///      a single bool inside a tuple selects between materially different
///      outcomes.
///
///      That is the class of parameter an encoder must not get wrong, and it is
///      exactly the class the KeeperHub simulate path mis-encodes when the value
///      arrives as the string "false" (see CalldataParityModule's header).
///
///      This contract exists so the divergence can be observed rather than
///      argued about: it records which branch actually ran.
contract SettlementTarget {
    struct FundManagement {
        address sender;
        bool fromInternalBalance;
        address recipient;
        bool toInternalBalance;
    }

    /// @notice Which branch the most recent `settle` call took.
    bool public lastUsedInternalBalance;

    /// @notice Incremented only when the external-transfer branch runs.
    uint256 public externalSettlements;

    /// @notice Incremented only when the internal-credit branch runs.
    uint256 public internalSettlements;

    /// @notice Credit balances for the internal-balance branch.
    mapping(address account => uint256 amount) public internalBalanceOf;

    event Settled(address indexed recipient, uint256 amount, bool usedInternalBalance);

    /// @notice Settle `amount` to `funds.recipient`.
    /// @dev The two branches are not cosmetic. `fromInternalBalance == true`
    ///      draws on a bookkeeping credit and moves no native value;
    ///      `false` transfers real funds out of this contract. An encoder that
    ///      flips this bool moves money that should not have moved, or fails to
    ///      move money that should have.
    function settle(FundManagement calldata funds, uint256 amount) external {
        if (funds.fromInternalBalance) {
            internalBalanceOf[funds.sender] += amount;
            internalSettlements += 1;
            lastUsedInternalBalance = true;
        } else {
            externalSettlements += 1;
            lastUsedInternalBalance = false;
        }
        emit Settled(funds.recipient, amount, funds.fromInternalBalance);
    }

    /// @notice Convenience view for the demo: the branch counters in one call.
    function counters()
        external
        view
        returns (uint256 internalCount, uint256 externalCount, bool lastInternal)
    {
        return (internalSettlements, externalSettlements, lastUsedInternalBalance);
    }

    receive() external payable {}
}
