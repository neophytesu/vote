// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./IVotingTypes.sol";
import "../types/VotingDataTypes.sol";

/**
 * @title IVotingCoreView
 * @notice VotingFactory/VotingCore 的只读接口（供模块解耦依赖）
 */
interface IVotingCoreView is IVotingTypes {
    function owner() external view returns (address);

    function getEffectiveState(uint256 votingId) external view returns (VotingState);
    function canRegister(uint256 votingId) external view returns (bool);
    function canVote(uint256 votingId) external view returns (bool);

    function getVotingCoreFields(uint256 votingId) external view returns (VotingDataTypes.VotingCoreFields memory);
    function getVotingText(uint256 votingId) external view returns (string memory title, string memory description);
    function getVotingOptions(uint256 votingId) external view returns (string[] memory);
    function getVotingWeights(uint256 votingId) external view returns (string[] memory names, uint256[] memory weights);
    function getThresholdCommittee(uint256 votingId) external view returns (address[] memory);

    function getSnapshotBalance(uint256 votingId, address account) external view returns (uint256);
}

