// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title 匿名投票用 Semaphore 接口（仅需方法）
interface ISemaphoreVoting {
    struct SemaphoreProof {
        uint256 merkleTreeDepth;
        uint256 merkleTreeRoot;
        uint256 nullifier;
        uint256 message;
        uint256 scope;
        uint256[8] points;
    }

    function createGroup(address admin) external returns (uint256 groupId);
    function addMember(uint256 groupId, uint256 identityCommitment) external;
    function validateProof(uint256 groupId, SemaphoreProof calldata proof) external;
    function getMerkleTreeRoot(uint256 groupId) external view returns (uint256);
    function getMerkleTreeSize(uint256 groupId) external view returns (uint256);
}
