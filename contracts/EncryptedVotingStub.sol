// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title EncryptedVotingStub
 * @notice 轻量占位合约，用于 localhost 部署时替代 EncryptedVoting
 * @dev 创建加密投票时仍会调用 initializeEncryptedVoting（占位无操作），
 *      实际提交选票需部署完整 EncryptedVoting。
 */
contract EncryptedVotingStub {
    function initializeEncryptedVoting(uint256 /* votingId */) external pure {
        // no-op: 占位，与 EncryptedVoting 接口一致
    }
}
