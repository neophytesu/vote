// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IVotingTypes.sol";

/**
 * @title StatisticsCenter
 * @notice 统计中心合约 - 存储和管理投票系统的统计数据
 * @dev 由 VotingFactory 调用来更新统计数据
 */
contract StatisticsCenter is IVotingTypes {
    
    // ==================== 事件 ====================
    
    /// @notice 统计数据更新事件
    event StatsUpdated(string indexed statType, uint256 newValue);
    
    /// @notice 用户统计更新事件
    event UserStatsUpdated(address indexed user, string indexed statType);

    // ==================== 全局统计 ====================
    
    /// @notice 全局统计数据结构
    struct GlobalStats {
        uint256 totalVotings;           // 总投票数
        uint256 totalVoters;            // 总选民注册次数
        uint256 totalVotesCast;         // 总投票次数
        uint256 totalCreators;          // 创建者数量
        uint256 totalParticipants;      // 参与者数量（去重）
        uint256 completedVotings;       // 已完成的投票数
        uint256 activeVotings;          // 进行中的投票数
    }
    
    /// @notice 全局统计数据
    GlobalStats public globalStats;
    
    // ==================== 按投票规则统计 ====================
    
    /// @notice 规则 => 使用次数
    mapping(VotingRule => uint256) public votingsByRule;
    
    // ==================== 按隐私级别统计 ====================
    
    /// @notice 隐私级别 => 使用次数
    mapping(PrivacyLevel => uint256) public votingsByPrivacy;
    
    // ==================== 按推进模式统计 ====================
    
    /// @notice 自动推进投票数
    uint256 public autoAdvanceVotings;
    
    /// @notice 手动推进投票数
    uint256 public manualAdvanceVotings;
    
    // ==================== 用户统计 ====================
    
    /// @notice 用户统计数据结构
    struct UserStats {
        uint256 votingsCreated;         // 创建的投票数
        uint256 votingsParticipated;    // 参与的投票数（注册）
        uint256 votesCast;              // 投票次数
        uint256 firstActivityTime;      // 首次活动时间
        uint256 lastActivityTime;       // 最后活动时间
        bool isCreator;                 // 是否是创建者
        bool isParticipant;             // 是否是参与者
    }
    
    /// @notice 用户地址 => 用户统计
    mapping(address => UserStats) public userStats;
    
    /// @notice 已知创建者列表
    address[] private creatorList;
    
    /// @notice 已知参与者列表
    address[] private participantList;
    
    // ==================== 时间段统计 ====================
    
    /// @notice 日期（天数）=> 创建的投票数
    mapping(uint256 => uint256) public dailyVotingsCreated;
    
    /// @notice 日期（天数）=> 投票次数
    mapping(uint256 => uint256) public dailyVotesCast;
    
    // ==================== 投票统计 ====================
    
    /// @notice 投票统计数据结构
    struct VotingStats {
        uint256 registrationCount;      // 注册人数
        uint256 voteCount;              // 投票人数
        uint256 participationRate;      // 参与率（百分比 * 100，如 5000 = 50.00%）
        uint256 createdAt;              // 创建时间
        uint256 completedAt;            // 完成时间（如果已完成）
        VotingRule rule;                // 投票规则
        PrivacyLevel privacy;           // 隐私级别
        bool isAutoAdvance;             // 是否自动推进
    }
    
    /// @notice 投票ID => 投票统计
    mapping(uint256 => VotingStats) public votingStats;
    
    // ==================== 排行榜 ====================
    
    /// @notice 最活跃创建者（按创建数量排序的地址列表）
    address[] public topCreators;
    
    /// @notice 最活跃参与者（按参与数量排序的地址列表）
    address[] public topParticipants;
    
    /// @notice 排行榜最大长度
    uint256 public constant TOP_LIST_SIZE = 10;
    
    // ==================== 访问控制 ====================
    
    /// @notice 合约所有者
    address public owner;
    
    /// @notice 授权的调用者（VotingFactory）
    address public authorizedCaller;

    /// @notice 匿名投票合约地址
    address public anonymousVoting;
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    modifier onlyAuthorized() {
        require(
            msg.sender == authorizedCaller || msg.sender == anonymousVoting || msg.sender == owner,
            "Not authorized"
        );
        _;
    }
    
    // ==================== 构造函数 ====================
    
    constructor() {
        owner = msg.sender;
    }
    
    /**
     * @notice 设置授权调用者（VotingFactory 地址）
     * @param _authorizedCaller 授权地址
     */
    function setAuthorizedCaller(address _authorizedCaller) external onlyOwner {
        authorizedCaller = _authorizedCaller;
    }

    /**
     * @notice 设置匿名投票合约地址
     * @param _anonymousVoting 匿名投票合约地址
     */
    function setAnonymousVoting(address _anonymousVoting) external onlyOwner {
        anonymousVoting = _anonymousVoting;
    }
    
    // ==================== 统计更新函数（由 VotingFactory 调用） ====================
    
    /**
     * @notice 记录投票创建
     * @param votingId 投票ID
     * @param creator 创建者地址
     * @param rule 投票规则
     * @param privacy 隐私级别
     * @param isAutoAdvance 是否自动推进
     */
    function recordVotingCreated(
        uint256 votingId,
        address creator,
        VotingRule rule,
        PrivacyLevel privacy,
        bool isAutoAdvance
    ) external onlyAuthorized {
        // 更新全局统计
        globalStats.totalVotings++;
        globalStats.activeVotings++;
        
        // 更新规则统计
        votingsByRule[rule]++;
        
        // 更新隐私级别统计
        votingsByPrivacy[privacy]++;
        
        // 更新推进模式统计
        if (isAutoAdvance) {
            autoAdvanceVotings++;
        } else {
            manualAdvanceVotings++;
        }
        
        // 更新用户统计
        UserStats storage stats = userStats[creator];
        stats.votingsCreated++;
        stats.lastActivityTime = block.timestamp;
        
        if (stats.firstActivityTime == 0) {
            stats.firstActivityTime = block.timestamp;
        }
        
        if (!stats.isCreator) {
            stats.isCreator = true;
            creatorList.push(creator);
            globalStats.totalCreators++;
        }
        
        // 更新投票统计
        votingStats[votingId] = VotingStats({
            registrationCount: 0,
            voteCount: 0,
            participationRate: 0,
            createdAt: block.timestamp,
            completedAt: 0,
            rule: rule,
            privacy: privacy,
            isAutoAdvance: isAutoAdvance
        });
        
        // 更新日统计
        uint256 today = block.timestamp / 1 days;
        dailyVotingsCreated[today]++;
        
        // 更新排行榜
        _updateTopCreators(creator);
        
        emit StatsUpdated("votingCreated", globalStats.totalVotings);
        emit UserStatsUpdated(creator, "created");
    }
    
    /**
     * @notice 记录选民注册
     * @param votingId 投票ID
     * @param voter 选民地址
     */
    function recordVoterRegistered(uint256 votingId, address voter) external onlyAuthorized {
        // 更新全局统计
        globalStats.totalVoters++;
        
        // 更新投票统计
        votingStats[votingId].registrationCount++;
        
        // 更新用户统计
        UserStats storage stats = userStats[voter];
        stats.votingsParticipated++;
        stats.lastActivityTime = block.timestamp;
        
        if (stats.firstActivityTime == 0) {
            stats.firstActivityTime = block.timestamp;
        }
        
        if (!stats.isParticipant) {
            stats.isParticipant = true;
            participantList.push(voter);
            globalStats.totalParticipants++;
        }
        
        // 更新排行榜
        _updateTopParticipants(voter);
        
        emit UserStatsUpdated(voter, "registered");
    }
    
    /**
     * @notice 记录投票
     * @param votingId 投票ID
     * @param voter 投票者地址
     */
    function recordVoteCast(uint256 votingId, address voter) external onlyAuthorized {
        // 更新全局统计
        globalStats.totalVotesCast++;
        
        // 更新投票统计
        VotingStats storage vStats = votingStats[votingId];
        vStats.voteCount++;
        
        // 计算参与率
        if (vStats.registrationCount > 0) {
            vStats.participationRate = (vStats.voteCount * 10000) / vStats.registrationCount;
        }
        
        // 更新用户统计
        UserStats storage uStats = userStats[voter];
        uStats.votesCast++;
        uStats.lastActivityTime = block.timestamp;
        
        // 更新日统计
        uint256 today = block.timestamp / 1 days;
        dailyVotesCast[today]++;
        
        emit UserStatsUpdated(voter, "voted");
    }
    
    /**
     * @notice 记录投票完成
     * @param votingId 投票ID
     */
    function recordVotingCompleted(uint256 votingId) external onlyAuthorized {
        globalStats.completedVotings++;
        if (globalStats.activeVotings > 0) {
            globalStats.activeVotings--;
        }
        
        votingStats[votingId].completedAt = block.timestamp;
        
        emit StatsUpdated("votingCompleted", globalStats.completedVotings);
    }
    
    // ==================== 排行榜更新函数 ====================
    
    /**
     * @notice 更新创建者排行榜
     * @param creator 创建者地址
     */
    function _updateTopCreators(address creator) internal {
        uint256 creatorCount = userStats[creator].votingsCreated;
        
        // 检查是否已在列表中
        int256 existingIndex = -1;
        for (uint256 i = 0; i < topCreators.length; i++) {
            if (topCreators[i] == creator) {
                existingIndex = int256(i);
                break;
            }
        }
        
        if (existingIndex >= 0) {
            // 已在列表中，重新排序
            _bubbleUp(topCreators, uint256(existingIndex), true);
        } else if (topCreators.length < TOP_LIST_SIZE) {
            // 列表未满，直接添加
            topCreators.push(creator);
            _bubbleUp(topCreators, topCreators.length - 1, true);
        } else {
            // 列表已满，检查是否比最后一个大
            if (creatorCount > userStats[topCreators[topCreators.length - 1]].votingsCreated) {
                topCreators[topCreators.length - 1] = creator;
                _bubbleUp(topCreators, topCreators.length - 1, true);
            }
        }
    }
    
    /**
     * @notice 更新参与者排行榜
     * @param participant 参与者地址
     */
    function _updateTopParticipants(address participant) internal {
        uint256 participantCount = userStats[participant].votingsParticipated;
        
        // 检查是否已在列表中
        int256 existingIndex = -1;
        for (uint256 i = 0; i < topParticipants.length; i++) {
            if (topParticipants[i] == participant) {
                existingIndex = int256(i);
                break;
            }
        }
        
        if (existingIndex >= 0) {
            // 已在列表中，重新排序
            _bubbleUp(topParticipants, uint256(existingIndex), false);
        } else if (topParticipants.length < TOP_LIST_SIZE) {
            // 列表未满，直接添加
            topParticipants.push(participant);
            _bubbleUp(topParticipants, topParticipants.length - 1, false);
        } else {
            // 列表已满，检查是否比最后一个大
            if (participantCount > userStats[topParticipants[topParticipants.length - 1]].votingsParticipated) {
                topParticipants[topParticipants.length - 1] = participant;
                _bubbleUp(topParticipants, topParticipants.length - 1, false);
            }
        }
    }
    
    /**
     * @notice 冒泡排序（将新元素移到正确位置）
     * @param list 地址列表
     * @param index 当前索引
     * @param isCreator 是否是创建者列表
     */
    function _bubbleUp(address[] storage list, uint256 index, bool isCreator) internal {
        while (index > 0) {
            uint256 currentValue = isCreator 
                ? userStats[list[index]].votingsCreated 
                : userStats[list[index]].votingsParticipated;
            uint256 prevValue = isCreator 
                ? userStats[list[index - 1]].votingsCreated 
                : userStats[list[index - 1]].votingsParticipated;
            
            if (currentValue > prevValue) {
                // 交换位置
                address temp = list[index - 1];
                list[index - 1] = list[index];
                list[index] = temp;
                index--;
            } else {
                break;
            }
        }
    }
    
    // ==================== 查询函数 ====================
    
    /**
     * @notice 获取全局统计
     * @return 全局统计数据
     */
    function getGlobalStats() external view returns (GlobalStats memory) {
        return globalStats;
    }
    
    /**
     * @notice 获取用户统计
     * @param user 用户地址
     * @return 用户统计数据
     */
    function getUserStats(address user) external view returns (UserStats memory) {
        return userStats[user];
    }
    
    /**
     * @notice 获取投票统计
     * @param votingId 投票ID
     * @return 投票统计数据
     */
    function getVotingStats(uint256 votingId) external view returns (VotingStats memory) {
        return votingStats[votingId];
    }
    
    /**
     * @notice 获取规则使用统计
     * @return simpleMajority 简单多数使用次数
     * @return weighted 加权投票使用次数
     * @return quadratic 二次方投票使用次数
     * @return rankedChoice 排序选择使用次数
     */
    function getRuleStats() external view returns (
        uint256 simpleMajority,
        uint256 weighted,
        uint256 quadratic,
        uint256 rankedChoice
    ) {
        return (
            votingsByRule[VotingRule.SimpleMajority],
            votingsByRule[VotingRule.Weighted],
            votingsByRule[VotingRule.Quadratic],
            votingsByRule[VotingRule.RankedChoice]
        );
    }
    
    /**
     * @notice 获取隐私级别使用统计
     * @return publicCount 公开投票使用次数
     * @return anonymousCount 匿名投票使用次数
     * @return encryptedCount 加密投票使用次数
     * @return fullPrivacyCount 完全隐私使用次数
     */
    function getPrivacyStats() external view returns (
        uint256 publicCount,
        uint256 anonymousCount,
        uint256 encryptedCount,
        uint256 fullPrivacyCount
    ) {
        return (
            votingsByPrivacy[PrivacyLevel.Public],
            votingsByPrivacy[PrivacyLevel.Anonymous],
            votingsByPrivacy[PrivacyLevel.Encrypted],
            votingsByPrivacy[PrivacyLevel.FullPrivacy]
        );
    }
    
    /**
     * @notice 获取推进模式统计
     * @return autoAdvance 自动推进数量
     * @return manualAdvance 手动推进数量
     */
    function getAdvanceModeStats() external view returns (
        uint256 autoAdvance,
        uint256 manualAdvance
    ) {
        return (autoAdvanceVotings, manualAdvanceVotings);
    }
    
    /**
     * @notice 获取创建者排行榜
     * @return 创建者地址数组
     */
    function getTopCreators() external view returns (address[] memory) {
        return topCreators;
    }
    
    /**
     * @notice 获取参与者排行榜
     * @return 参与者地址数组
     */
    function getTopParticipants() external view returns (address[] memory) {
        return topParticipants;
    }
    
    /**
     * @notice 获取指定日期的统计
     * @param dayTimestamp 日期时间戳（会自动转换为当天开始）
     * @return votingsCreated 当日创建的投票数
     * @return votesCast 当日投票次数
     */
    function getDailyStats(uint256 dayTimestamp) external view returns (
        uint256 votingsCreated,
        uint256 votesCast
    ) {
        uint256 day = dayTimestamp / 1 days;
        return (dailyVotingsCreated[day], dailyVotesCast[day]);
    }
    
    /**
     * @notice 获取过去N天的统计
     * @param days_ 天数
     * @return votingsCreated 创建的投票数数组
     * @return votesCast 投票次数数组
     */
    function getRecentDailyStats(uint256 days_) external view returns (
        uint256[] memory votingsCreated,
        uint256[] memory votesCast
    ) {
        votingsCreated = new uint256[](days_);
        votesCast = new uint256[](days_);
        
        uint256 today = block.timestamp / 1 days;
        
        for (uint256 i = 0; i < days_; i++) {
            uint256 day = today - i;
            votingsCreated[i] = dailyVotingsCreated[day];
            votesCast[i] = dailyVotesCast[day];
        }
        
        return (votingsCreated, votesCast);
    }
    
    /**
     * @notice 获取创建者总数
     */
    function getCreatorCount() external view returns (uint256) {
        return creatorList.length;
    }
    
    /**
     * @notice 获取参与者总数
     */
    function getParticipantCount() external view returns (uint256) {
        return participantList.length;
    }
}
