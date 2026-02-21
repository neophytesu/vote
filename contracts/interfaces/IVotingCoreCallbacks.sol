// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IVotingCoreCallbacks
 * @notice 供模块回调 core 的最小写接口（事件/参与记录等）
 */
interface IVotingCoreCallbacks {
    function recordVoterParticipation(address voter, uint256 votingId) external;
    function emitVoterRegistered(uint256 votingId, address voter) external;
    function emitAnonymousVoteCast(uint256 votingId, uint256 optionIndex, uint256 nullifierHash) external;
    function emitEncryptedVoteCast(uint256 votingId, bytes32 ballotHash) external;
}

