// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IVotingTypes.sol";
import "./RegistrationCenter.sol";
import "./VotingCenter.sol";
import "./RevealCenter.sol";
import "./VotingFactory.sol";

/**
 * @title QueryCenter
 * @notice 查询中心合约 - 聚合所有中心合约的只读查询
 * @dev 从 VotingFactory 拆分出的纯 view 函数，减小 VotingFactory 字节码体积
 */
contract QueryCenter is IVotingTypes {

    VotingFactory public votingFactory;
    RegistrationCenter public registrationCenter;
    VotingCenter public votingCenter;
    RevealCenter public revealCenter;

    constructor(address _votingFactory) {
        votingFactory = VotingFactory(_votingFactory);
        (
            address registration,
            address voting,
            address reveal,
            // statisticsCenter not needed for queries
        ) = votingFactory.getCenterAddresses();
        registrationCenter = RegistrationCenter(registration);
        votingCenter = VotingCenter(voting);
        revealCenter = RevealCenter(reveal);
    }

    // ==================== 查询函数 ====================

    /**
     * @notice 获取投票详情（聚合所有中心合约的数据）
     * @param votingId 投票ID
     * @return 投票详情
     */
    function getVoting(uint256 votingId) 
        public 
        view 
        returns (VotingFactory.VotingDetails memory) 
    {
        VotingFactory.VotingInfo memory info = votingFactory.getVotingRaw(votingId);
        
        uint256 totalVoters = registrationCenter.getVoterCount(votingId);
        uint256 totalVotes = votingCenter.getTotalVotes(votingId);
        uint256[] memory voteCounts = votingCenter.getAllVoteCounts(votingId);
        bool resultRevealed = revealCenter.isResultRevealed(votingId);
        VotingState effectiveState = votingFactory.getEffectiveState(votingId);

        return VotingFactory.VotingDetails({
            id: info.id,
            creator: info.creator,
            title: info.title,
            description: info.description,
            options: info.options,
            votingRule: info.votingRule,
            privacyLevel: info.privacyLevel,
            state: effectiveState,
            registrationStart: info.registrationStart,
            registrationEnd: info.registrationEnd,
            votingStart: info.votingStart,
            votingEnd: info.votingEnd,
            quorum: info.quorum,
            totalVoters: totalVoters,
            totalVotes: totalVotes,
            voteCounts: voteCounts,
            resultRevealed: resultRevealed,
            createdAt: info.createdAt,
            autoAdvance: info.autoAdvance,
            visibilityBitmap: info.visibilityBitmap,
            weightGroupNames: info.weightGroupNames,
            weightGroupWeights: info.weightGroupWeights,
            registrationRule: info.registrationRule,
            tokenContractAddress: info.tokenContractAddress,
            tokenMinBalance: info.tokenMinBalance
        });
    }

    /**
     * @notice 获取所有投票ID列表
     * @return 投票ID数组
     */
    function getAllVotingIds() external view returns (uint256[] memory) {
        uint256 count = votingFactory.votingCount();
        uint256[] memory ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = i + 1;
        }
        return ids;
    }

    /**
     * @notice 获取最近N个投票
     * @param count 数量
     * @return 投票详情数组
     */
    function getRecentVotings(uint256 count) external view returns (VotingFactory.VotingDetails[] memory) {
        uint256 total = votingFactory.votingCount();
        uint256 resultCount = count > total ? total : count;
        VotingFactory.VotingDetails[] memory result = new VotingFactory.VotingDetails[](resultCount);
        
        for (uint256 i = 0; i < resultCount; i++) {
            uint256 votingId = total - i;
            result[i] = getVoting(votingId);
        }
        
        return result;
    }

    /**
     * @notice 获取用户创建的投票
     * @param creator 创建者地址
     * @return 投票ID数组
     */
    function getVotingsByCreator(address creator) external view returns (uint256[] memory) {
        return votingFactory.getCreatorVotings(creator);
    }

    /**
     * @notice 获取用户参与的投票
     * @param voter 选民地址
     * @return 投票ID数组
     */
    function getVotingsByVoter(address voter) external view returns (uint256[] memory) {
        return votingFactory.getVoterParticipations(voter);
    }

    /**
     * @notice 获取投票选项
     * @param votingId 投票ID
     * @return 选项数组
     */
    function getVotingOptions(uint256 votingId) external view returns (string[] memory) {
        VotingFactory.VotingInfo memory info = votingFactory.getVotingRaw(votingId);
        return info.options;
    }

    /**
     * @notice 获取投票结果 - 从 RevealCenter 获取
     * @param votingId 投票ID
     * @return voteCounts 各选项票数
     * @return winningOption 胜出选项
     * @return totalVotes 总票数
     */
    function getVotingResult(uint256 votingId)
        external
        view
        returns (
            uint256[] memory voteCounts,
            uint256 winningOption,
            uint256 totalVotes
        )
    {
        require(revealCenter.isResultRevealed(votingId), "Result not revealed");
        RevealCenter.VotingResult memory result = revealCenter.getResult(votingId);
        return (result.voteCounts, result.winningOption, result.totalVotes);
    }

    /**
     * @notice 检查用户的投票状态
     * @param votingId 投票ID
     * @param user 用户地址
     * @return registered 是否注册
     * @return voted 是否已投票
     */
    function getUserVotingStatus(uint256 votingId, address user)
        external
        view
        returns (bool registered, bool voted)
    {
        registered = registrationCenter.isEligibleVoter(votingId, user);
        voted = votingCenter.hasVoterVoted(votingId, user);
        return (registered, voted);
    }

    /**
     * @notice 获取投票当前状态（返回有效状态）
     * @param votingId 投票ID
     * @return 投票状态
     */
    function getVotingState(uint256 votingId)
        external
        view
        returns (VotingState)
    {
        return votingFactory.getEffectiveState(votingId);
    }

    /**
     * @notice 批量获取投票详情
     * @param votingIds 投票ID数组
     * @return 投票详情数组
     */
    function getVotingsBatch(uint256[] calldata votingIds) 
        external 
        view 
        returns (VotingFactory.VotingDetails[] memory) 
    {
        uint256 total = votingFactory.votingCount();
        VotingFactory.VotingDetails[] memory result = new VotingFactory.VotingDetails[](votingIds.length);
        
        for (uint256 i = 0; i < votingIds.length; i++) {
            if (votingIds[i] > 0 && votingIds[i] <= total) {
                result[i] = getVoting(votingIds[i]);
            }
        }
        
        return result;
    }

    /**
     * @notice 获取待审核选民列表
     * @param votingId 投票ID
     * @return 待审核选民地址列表
     */
    function getPendingVoters(uint256 votingId)
        external
        view
        returns (address[] memory)
    {
        return registrationCenter.getPendingVoters(votingId);
    }

    /**
     * @notice 获取待审核选民数量
     * @param votingId 投票ID
     * @return 待审核数量
     */
    function getPendingCount(uint256 votingId)
        external
        view
        returns (uint256)
    {
        return registrationCenter.getPendingCount(votingId);
    }

    /**
     * @notice 检查用户是否在待审核状态
     * @param votingId 投票ID
     * @param voter 选民地址
     * @return 是否待审核
     */
    function isPendingVoter(uint256 votingId, address voter)
        external
        view
        returns (bool)
    {
        return registrationCenter.isPendingVoter(votingId, voter);
    }

    /**
     * @notice 获取用户的完整注册状态（已注册 / 待审核 / 已投票）
     * @param votingId 投票ID
     * @param user 用户地址
     * @return registered 是否已注册
     * @return pending 是否待审核
     * @return voted 是否已投票
     */
    function getUserFullStatus(uint256 votingId, address user)
        external
        view
        returns (bool registered, bool pending, bool voted)
    {
        registered = registrationCenter.isEligibleVoter(votingId, user);
        pending = registrationCenter.isPendingVoter(votingId, user);
        voted = votingCenter.hasVoterVoted(votingId, user);
        return (registered, pending, voted);
    }

    /**
     * @notice 检查用户是否已注册
     */
    function isRegistered(uint256 votingId, address voter) 
        external 
        view 
        returns (bool) 
    {
        return registrationCenter.isEligibleVoter(votingId, voter);
    }

    /**
     * @notice 检查用户是否已投票
     */
    function hasVoted(uint256 votingId, address voter) 
        external 
        view 
        returns (bool) 
    {
        return votingCenter.hasVoterVoted(votingId, voter);
    }

    /**
     * @notice 获取投票记录
     * @param votingId 投票ID
     * @return voters 投票者地址数组
     * @return optionIndexes 选项索引数组
     * @return timestamps 时间戳数组
     */
    function getVoteRecords(uint256 votingId)
        external
        view
        returns (
            address[] memory voters,
            uint256[] memory optionIndexes,
            uint256[] memory timestamps
        )
    {
        return votingCenter.getVoteRecords(votingId);
    }

    /**
     * @notice 获取排序选择投票的完整记录
     * @param votingId 投票ID
     * @return voters 投票者地址数组
     * @return rankings 每位投票者的完整排名
     * @return timestamps 时间戳数组
     */
    function getRankedVoteRecords(uint256 votingId)
        external
        view
        returns (
            address[] memory voters,
            uint256[][] memory rankings,
            uint256[] memory timestamps
        )
    {
        return votingCenter.getRankedVoteRecords(votingId);
    }

    /**
     * @notice 获取特定选民的投票选择
     * @param votingId 投票ID
     * @param voter 选民地址
     * @return optionIndex 投票选项
     * @return timestamp 投票时间
     * @return voted 是否已投票
     */
    function getVoterChoice(uint256 votingId, address voter)
        external
        view
        returns (
            uint256 optionIndex,
            uint256 timestamp,
            bool voted
        )
    {
        return votingCenter.getVoterChoice(votingId, voter);
    }
}
