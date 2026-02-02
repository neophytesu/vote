// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IVotingTypes.sol";

/**
 * @title RevealCenter
 * @notice 揭示中心 - 管理投票结果的揭示和验证
 * @dev 对应文档中的 Step 5: 结果公布与验证
 * 
 * 核心职责:
 * - 揭示投票结果
 * - 公布最终结果
 * - 提供结果验证
 * - 触发执行机制（简化版只记录结果）
 */
contract RevealCenter is IVotingTypes {
    
    /// @notice 结果揭示事件
    event ResultRevealed(
        uint256 indexed proposalId,
        uint256[] voteCounts,
        uint256 winningOption,
        uint256 timestamp
    );
    
    /// @notice 提案执行事件
    event ProposalExecuted(uint256 indexed proposalId, bool passed);

    /// @notice 投票结果结构
    struct VotingResult {
        uint256[] voteCounts;      // 各选项票数
        uint256 totalVotes;        // 总投票数
        uint256 totalVoters;       // 注册选民数
        uint256 winningOption;     // 胜出选项索引
        uint256 winningVotes;      // 胜出选项票数
        bool isRevealed;           // 是否已揭示
        bool passed;               // 提案是否通过（达到法定人数）
        uint256 revealedAt;        // 揭示时间
    }

    /// @notice 主投票合约地址
    address public votingCore;

    /// @notice 提案ID => 投票结果
    mapping(uint256 => VotingResult) public results;

    /// @notice 仅限主合约调用
    modifier onlyVotingCore() {
        require(msg.sender == votingCore, "Only VotingCore can call");
        _;
    }

    constructor() {}

    /// @notice 设置主投票合约地址
    function setVotingCore(address _votingCore) external {
        require(votingCore == address(0), "VotingCore already set");
        votingCore = _votingCore;
    }

    /**
     * @notice 揭示投票结果
     * @param proposalId 提案ID
     * @param voteCounts 各选项票数
     * @param totalVoters 注册选民总数
     * @param quorum 法定人数
     * @return result 投票结果
     * 
     * 对应文档流程:
     * 1. 公布最终结果
     * 2. 计算胜出选项
     * 3. 验证是否达到法定人数
     * 4. 触发执行机制
     */
    function revealResult(
        uint256 proposalId,
        uint256[] calldata voteCounts,
        uint256 totalVoters,
        uint256 quorum
    ) external onlyVotingCore returns (VotingResult memory result) {
        require(!results[proposalId].isRevealed, "Result already revealed");
        require(voteCounts.length > 0, "No vote counts provided");

        // 计算总票数和胜出选项
        uint256 totalVotes = 0;
        uint256 winningOption = 0;
        uint256 winningVotes = 0;

        for (uint256 i = 0; i < voteCounts.length; i++) {
            totalVotes += voteCounts[i];
            if (voteCounts[i] > winningVotes) {
                winningVotes = voteCounts[i];
                winningOption = i;
            }
        }

        // 检查是否达到法定人数
        bool passed = totalVotes >= quorum;

        // 存储结果
        results[proposalId] = VotingResult({
            voteCounts: voteCounts,
            totalVotes: totalVotes,
            totalVoters: totalVoters,
            winningOption: winningOption,
            winningVotes: winningVotes,
            isRevealed: true,
            passed: passed,
            revealedAt: block.timestamp
        });

        emit ResultRevealed(proposalId, voteCounts, winningOption, block.timestamp);

        if (passed) {
            emit ProposalExecuted(proposalId, true);
        }

        return results[proposalId];
    }

    /**
     * @notice 获取投票结果
     * @param proposalId 提案ID
     * @return result 投票结果
     */
    function getResult(uint256 proposalId) external view returns (VotingResult memory) {
        require(results[proposalId].isRevealed, "Result not revealed yet");
        return results[proposalId];
    }

    /**
     * @notice 检查结果是否已揭示
     * @param proposalId 提案ID
     * @return 是否已揭示
     */
    function isResultRevealed(uint256 proposalId) external view returns (bool) {
        return results[proposalId].isRevealed;
    }

    /**
     * @notice 获取胜出选项
     * @param proposalId 提案ID
     * @return optionIndex 胜出选项索引
     * @return votes 胜出选项票数
     */
    function getWinningOption(uint256 proposalId) external view returns (
        uint256 optionIndex,
        uint256 votes
    ) {
        require(results[proposalId].isRevealed, "Result not revealed yet");
        return (results[proposalId].winningOption, results[proposalId].winningVotes);
    }

    /**
     * @notice 获取投票参与率
     * @param proposalId 提案ID
     * @return participationRate 参与率 (百分比 * 100, 如 5000 = 50%)
     */
    function getParticipationRate(uint256 proposalId) external view returns (uint256) {
        require(results[proposalId].isRevealed, "Result not revealed yet");
        VotingResult memory result = results[proposalId];
        
        if (result.totalVoters == 0) return 0;
        return (result.totalVotes * 10000) / result.totalVoters;
    }

    /**
     * @notice 检查提案是否通过
     * @param proposalId 提案ID
     * @return 提案是否通过
     */
    function isProposalPassed(uint256 proposalId) external view returns (bool) {
        require(results[proposalId].isRevealed, "Result not revealed yet");
        return results[proposalId].passed;
    }
}

