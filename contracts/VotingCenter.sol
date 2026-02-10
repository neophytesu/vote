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
        uint256 weight;  // 投票权重（简单多数为1，加权投票为分组权重）
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

    /// @notice 提案ID => 所有选民的排名列表（排序选择投票使用）
    mapping(uint256 => uint256[][]) private rankedVotes;

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
     * @notice 提交投票（支持加权）
     * @param proposalId 提案ID
     * @param voter 投票者地址
     * @param optionIndex 选项索引 (0-based)
     * @param weight 投票权重（简单多数传1，加权投票传分组权重）
     * @return success 是否投票成功
     * 
     * 对应文档流程:
     * 1. 构造投票内容 vote ∈ {0,1,...,n}
     * 2. 验证选民资格 (通过注册中心)
     * 3. 防止双重投票 (检查nullifierHash)
     * 4. 聚合票数 (按权重累加)
     */
    function castVote(
        uint256 proposalId,
        address voter,
        uint256 optionIndex,
        uint256 weight
    ) external onlyVotingCore returns (bool success) {
        require(!hasVoted[proposalId][voter], "Already voted");
        require(optionIndex < optionCounts[proposalId], "Invalid option index");
        require(weight > 0, "Weight must be > 0");

        // 标记已投票（防止双重投票）
        hasVoted[proposalId][voter] = true;
        
        // 按权重记录投票
        voteCounts[proposalId][optionIndex] += weight;
        totalVotes[proposalId] += weight;

        // 存储投票记录（用于审计）
        voteRecords[proposalId].push(Vote({
            voter: voter,
            optionIndex: optionIndex,
            timestamp: block.timestamp,
            isValid: true,
            weight: weight
        }));

        emit VoteCast(proposalId, voter, optionIndex, block.timestamp);
        
        return true;
    }

    /**
     * @notice 提交二次方投票（多选项 + 二次方成本验证）
     * @param proposalId 提案ID
     * @param voter 投票者地址
     * @param optionIndexes 选项索引数组
     * @param voteAmounts 每个选项的投票数量
     * @param totalCredits 总积分（固定100）
     * @return success 是否投票成功
     */
    function castQuadraticVote(
        uint256 proposalId,
        address voter,
        uint256[] calldata optionIndexes,
        uint256[] calldata voteAmounts,
        uint256 totalCredits
    ) external onlyVotingCore returns (bool success) {
        require(!hasVoted[proposalId][voter], "Already voted");
        require(optionIndexes.length == voteAmounts.length, "Array length mismatch");
        require(optionIndexes.length > 0, "Must vote for at least one option");

        // 验证二次方成本：sum(voteAmounts[i]^2) <= totalCredits
        uint256 totalCost = 0;
        uint256 totalVoteCount = 0;
        for (uint256 i = 0; i < voteAmounts.length; i++) {
            require(optionIndexes[i] < optionCounts[proposalId], "Invalid option index");
            require(voteAmounts[i] > 0, "Vote amount must be > 0");
            totalCost += voteAmounts[i] * voteAmounts[i]; // cost = votes^2
            totalVoteCount += voteAmounts[i];
        }
        require(totalCost <= totalCredits, "Insufficient credits");

        // 标记已投票
        hasVoted[proposalId][voter] = true;

        // 记录每个选项的票数
        for (uint256 i = 0; i < optionIndexes.length; i++) {
            voteCounts[proposalId][optionIndexes[i]] += voteAmounts[i];

            // 存储投票记录（每个选项一条记录，用于审计）
            voteRecords[proposalId].push(Vote({
                voter: voter,
                optionIndex: optionIndexes[i],
                timestamp: block.timestamp,
                isValid: true,
                weight: voteAmounts[i]
            }));

            emit VoteCast(proposalId, voter, optionIndexes[i], block.timestamp);
        }

        totalVotes[proposalId] += totalVoteCount;

        return true;
    }

    /**
     * @notice 提交排序选择投票（选民对所有选项按偏好排序）
     * @param proposalId 提案ID
     * @param voter 投票者地址
     * @param rankedOptions 按偏好排序的选项索引数组（第1选择在前）
     * @return success 是否投票成功
     */
    function castRankedVote(
        uint256 proposalId,
        address voter,
        uint256[] calldata rankedOptions
    ) external onlyVotingCore returns (bool success) {
        require(!hasVoted[proposalId][voter], "Already voted");
        uint256 numOptions = optionCounts[proposalId];
        require(rankedOptions.length == numOptions, "Must rank all options");

        // 验证每个选项恰好出现一次
        bool[] memory seen = new bool[](numOptions);
        for (uint256 i = 0; i < rankedOptions.length; i++) {
            require(rankedOptions[i] < numOptions, "Invalid option index");
            require(!seen[rankedOptions[i]], "Duplicate option in ranking");
            seen[rankedOptions[i]] = true;
        }

        // 标记已投票
        hasVoted[proposalId][voter] = true;

        // 存储完整排名
        rankedVotes[proposalId].push(rankedOptions);

        // 总投票人数 +1
        totalVotes[proposalId]++;

        // 记录投票记录（以第1选择为 optionIndex，用于审计）
        voteRecords[proposalId].push(Vote({
            voter: voter,
            optionIndex: rankedOptions[0],
            timestamp: block.timestamp,
            isValid: true,
            weight: 1
        }));

        emit VoteCast(proposalId, voter, rankedOptions[0], block.timestamp);

        return true;
    }

    /**
     * @notice 计算排序选择投票结果（IRV 即时决选算法）
     * @param proposalId 提案ID
     * @return finalCounts 最终轮各选项票数
     *
     * 算法：
     * 1. 统计每位选民的当前最高偏好（跳过已淘汰选项）
     * 2. 如果某选项获得 > 50% 的票则结束
     * 3. 否则淘汰得票最少的选项
     * 4. 重复直到只剩一个选项
     */
    function computeRankedResult(uint256 proposalId) external view returns (uint256[] memory finalCounts) {
        uint256 numOptions = optionCounts[proposalId];
        uint256[][] storage rankings = rankedVotes[proposalId];
        uint256 numVoters = rankings.length;

        finalCounts = new uint256[](numOptions);

        if (numVoters == 0) {
            return finalCounts;
        }

        bool[] memory eliminated = new bool[](numOptions);
        uint256 eliminatedCount = 0;
        uint256 majority = numVoters / 2 + 1;

        while (eliminatedCount < numOptions - 1) {
            // 重置票数
            for (uint256 i = 0; i < numOptions; i++) {
                finalCounts[i] = 0;
            }

            // 统计每位选民的当前最高偏好
            for (uint256 v = 0; v < numVoters; v++) {
                for (uint256 r = 0; r < rankings[v].length; r++) {
                    uint256 option = rankings[v][r];
                    if (!eliminated[option]) {
                        finalCounts[option]++;
                        break;
                    }
                }
            }

            // 检查是否有选项过半
            for (uint256 i = 0; i < numOptions; i++) {
                if (!eliminated[i] && finalCounts[i] >= majority) {
                    return finalCounts; // 有赢家，结束
                }
            }

            // 找到得票最少的选项并淘汰
            uint256 minVotes = type(uint256).max;
            uint256 minOption = 0;
            for (uint256 i = 0; i < numOptions; i++) {
                if (!eliminated[i] && finalCounts[i] < minVotes) {
                    minVotes = finalCounts[i];
                    minOption = i;
                }
            }

            eliminated[minOption] = true;
            eliminatedCount++;
        }

        return finalCounts;
    }

    /**
     * @notice 将 IRV 计算出的最终票数回写到 voteCounts（仅供 revealResult 调用）
     * @param proposalId 提案ID
     * @param counts 最终各选项票数
     */
    function writeRankedResultCounts(
        uint256 proposalId,
        uint256[] calldata counts
    ) external onlyVotingCore {
        for (uint256 i = 0; i < counts.length; i++) {
            voteCounts[proposalId][i] = counts[i];
        }
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
     * @notice 获取排序选择投票的完整记录（选民地址 + 完整排名 + 时间）
     * @param proposalId 提案ID
     * @return voters 投票者地址数组
     * @return rankings 每位投票者的完整排名（二维数组）
     * @return timestamps 时间戳数组
     */
    function getRankedVoteRecords(uint256 proposalId) external view returns (
        address[] memory voters,
        uint256[][] memory rankings,
        uint256[] memory timestamps
    ) {
        uint256[][] storage allRankings = rankedVotes[proposalId];
        Vote[] storage records = voteRecords[proposalId];
        uint256 len = allRankings.length;

        voters = new address[](len);
        rankings = new uint256[][](len);
        timestamps = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            // voteRecords 中排序投票的记录与 rankedVotes 一一对应
            if (i < records.length) {
                voters[i] = records[i].voter;
                timestamps[i] = records[i].timestamp;
            }
            // 复制完整排名
            rankings[i] = new uint256[](allRankings[i].length);
            for (uint256 j = 0; j < allRankings[i].length; j++) {
                rankings[i][j] = allRankings[i][j];
            }
        }

        return (voters, rankings, timestamps);
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

