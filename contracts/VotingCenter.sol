// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IVotingTypes.sol";

/**
 * @title VotingCenter
 * @notice 计票中心 - 管理投票提交和票数聚合
 * @dev 对应文档中的 Step 3: 投票 和 Step 4: 计票
 * 
 * 核心职责:
 * - 接收并验证投票
 * - 防止双重投票
 * - 聚合投票（简化版直接计数，后续可升级为同态加密）
 */
contract VotingCenter is IVotingTypes {
    
    /// @notice 投票事件
    event VoteCast(
        uint256 indexed proposalId, 
        address indexed voter, 
        uint256 optionIndex, 
        uint256 timestamp
    );
    
    /// @notice 投票聚合事件
    event VotesAggregated(uint256 indexed proposalId, uint256 totalVotes);

    /// @notice 单个投票记录
    struct Vote {
        address voter;
        uint256 optionIndex;
        uint256 timestamp;
        bool isValid;
    }

    /// @notice 主投票合约地址
    address public votingCore;
    
    /// @notice 注册中心地址
    address public registrationCenter;

    /// @notice 提案ID => 选民地址 => 是否已投票
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    
    /// @notice 提案ID => 选项索引 => 票数
    mapping(uint256 => mapping(uint256 => uint256)) public voteCounts;
    
    /// @notice 提案ID => 总投票数
    mapping(uint256 => uint256) public totalVotes;
    
    /// @notice 提案ID => 选项数量
    mapping(uint256 => uint256) public optionCounts;

    /// @notice 提案ID => 投票记录列表（用于审计）
    mapping(uint256 => Vote[]) private voteRecords;

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

    /// @notice 设置注册中心地址
    function setRegistrationCenter(address _registrationCenter) external {
        require(registrationCenter == address(0), "RegistrationCenter already set");
        registrationCenter = _registrationCenter;
    }

    /**
     * @notice 初始化提案的选项数量
     * @param proposalId 提案ID
     * @param _optionCount 选项数量
     */
    function initializeProposal(
        uint256 proposalId, 
        uint256 _optionCount
    ) external onlyVotingCore {
        require(_optionCount > 0, "Must have at least one option");
        optionCounts[proposalId] = _optionCount;
    }

    /**
     * @notice 提交投票
     * @param proposalId 提案ID
     * @param voter 投票者地址
     * @param optionIndex 选项索引 (0-based)
     * @return success 是否投票成功
     * 
     * 对应文档流程:
     * 1. 构造投票内容 vote ∈ {0,1,...,n}
     * 2. 验证选民资格 (通过注册中心)
     * 3. 防止双重投票 (检查nullifierHash)
     * 4. 聚合票数 (简化版直接计数)
     */
    function castVote(
        uint256 proposalId,
        address voter,
        uint256 optionIndex
    ) external onlyVotingCore returns (bool success) {
        require(!hasVoted[proposalId][voter], "Already voted");
        require(optionIndex < optionCounts[proposalId], "Invalid option index");

        // 标记已投票（防止双重投票）
        hasVoted[proposalId][voter] = true;
        
        // 记录投票
        voteCounts[proposalId][optionIndex]++;
        totalVotes[proposalId]++;

        // 存储投票记录（用于审计）
        voteRecords[proposalId].push(Vote({
            voter: voter,
            optionIndex: optionIndex,
            timestamp: block.timestamp,
            isValid: true
        }));

        emit VoteCast(proposalId, voter, optionIndex, block.timestamp);
        
        return true;
    }

    /**
     * @notice 获取选项的票数
     * @param proposalId 提案ID
     * @param optionIndex 选项索引
     * @return 票数
     */
    function getVoteCount(
        uint256 proposalId, 
        uint256 optionIndex
    ) external view returns (uint256) {
        return voteCounts[proposalId][optionIndex];
    }

    /**
     * @notice 获取所有选项的票数
     * @param proposalId 提案ID
     * @return counts 各选项票数数组
     */
    function getAllVoteCounts(uint256 proposalId) external view returns (uint256[] memory counts) {
        uint256 numOptions = optionCounts[proposalId];
        counts = new uint256[](numOptions);
        
        for (uint256 i = 0; i < numOptions; i++) {
            counts[i] = voteCounts[proposalId][i];
        }
        
        return counts;
    }

    /**
     * @notice 获取总投票数
     * @param proposalId 提案ID
     * @return 总投票数
     */
    function getTotalVotes(uint256 proposalId) external view returns (uint256) {
        return totalVotes[proposalId];
    }

    /**
     * @notice 检查选民是否已投票
     * @param proposalId 提案ID
     * @param voter 选民地址
     * @return 是否已投票
     */
    function hasVoterVoted(
        uint256 proposalId, 
        address voter
    ) external view returns (bool) {
        return hasVoted[proposalId][voter];
    }

    /**
     * @notice 获取投票记录数量（用于审计）
     * @param proposalId 提案ID
     * @return 记录数量
     */
    function getVoteRecordCount(uint256 proposalId) external view returns (uint256) {
        return voteRecords[proposalId].length;
    }

    /**
     * @notice 获取所有投票记录（用于审计和展示）
     * @param proposalId 提案ID
     * @return voters 投票者地址数组
     * @return optionIndexes 选项索引数组
     * @return timestamps 时间戳数组
     */
    function getVoteRecords(uint256 proposalId) external view returns (
        address[] memory voters,
        uint256[] memory optionIndexes,
        uint256[] memory timestamps
    ) {
        Vote[] storage records = voteRecords[proposalId];
        uint256 len = records.length;
        
        voters = new address[](len);
        optionIndexes = new uint256[](len);
        timestamps = new uint256[](len);
        
        for (uint256 i = 0; i < len; i++) {
            voters[i] = records[i].voter;
            optionIndexes[i] = records[i].optionIndex;
            timestamps[i] = records[i].timestamp;
        }
        
        return (voters, optionIndexes, timestamps);
    }

    /**
     * @notice 获取特定选民的投票记录
     * @param proposalId 提案ID
     * @param voter 选民地址
     * @return optionIndex 投票选项（如果未投票返回 type(uint256).max）
     * @return timestamp 投票时间
     * @return voted 是否已投票
     */
    function getVoterChoice(uint256 proposalId, address voter) external view returns (
        uint256 optionIndex,
        uint256 timestamp,
        bool voted
    ) {
        if (!hasVoted[proposalId][voter]) {
            return (type(uint256).max, 0, false);
        }
        
        Vote[] storage records = voteRecords[proposalId];
        for (uint256 i = 0; i < records.length; i++) {
            if (records[i].voter == voter) {
                return (records[i].optionIndex, records[i].timestamp, true);
            }
        }
        
        return (type(uint256).max, 0, false);
    }
}

