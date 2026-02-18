// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title MockExecutionTarget
 * @notice 供 ExecutionCenter 测试用：记录是否被调用及收到的 value
 */
contract MockExecutionTarget {
    bool public executed;
    uint256 public valueReceived;

    function setExecuted() external payable {
        executed = true;
        valueReceived = msg.value;
    }

    receive() external payable {
        executed = true;
        valueReceived = msg.value;
    }
}
