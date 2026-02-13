// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IVotingTypes.sol";

/**
 * @title AnonymousVotingStub
 * @notice 轻量占位合约，用于 localhost 部署时替代 AnonymousVoting
 * @dev 不依赖 PoseidonT3/Semaphore，创建匿名投票时会 revert。
 *      仅公开投票(Public)可用，适用于前端联调等场景。
 */
contract AnonymousVotingStub {
    function createGroups(
        uint256,
        IVotingTypes.VotingRule,
        uint256
    ) external pure {
        revert("Anonymous voting disabled: use deploy:hardhat for full deployment");
    }
}
