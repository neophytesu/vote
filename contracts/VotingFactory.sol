// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IVotingTypes.sol";
import "./RegistrationCenter.sol";
import "./VotingCenter.sol";
import "./RevealCenter.sol";
import "./StatisticsCenter.sol";

/**
 * @title VotingFactory
 * @notice 投票工厂合约 - 统一入口，调用三个模块化中心合约
 * @dev 创建和管理投票实例，实际业务由 RegistrationCenter、VotingCenter、RevealCenter 处理
 */
contract VotingFactory is IVotingTypes {
    
    /// @notice 投票创建事件
    event VotingCreated(
        uint256 indexed votingId,
        address indexed creator,
        string title,
        uint256 timestamp
    );

    /// @notice 选民注册事件
    event VoterRegistered(uint256 indexed votingId, address indexed voter);
    
    /// @notice 投票事件
    event VoteCast(uint256 indexed votingId, address indexed voter, uint256 optionIndex);
    
    /// @notice 状态变更事件
    event StateChanged(uint256 indexed votingId, VotingState newState);
    
    /// @notice 结果揭示事件
    event ResultRevealed(uint256 indexed votingId, uint256 winningOption);

    /// @notice 投票基本信息结构（不包含由中心合约管理的数据）
    struct VotingInfo {
        uint256 id;
        address creator;
        string title;
        string description;
        string[] options;
        VotingRule votingRule;
        PrivacyLevel privacyLevel;
        VotingState state;
        uint256 registrationStart;
        uint256 registrationEnd;
        uint256 votingStart;
        uint256 votingEnd;
        uint256 quorum;
        uint256 createdAt;
        bool autoAdvance;  // 是否自动推进状态
        uint16 visibilityBitmap;  // 可见性配置位图 (每项2位: 0=隐藏,1=创建者,2=参与者,3=公开)
        string[] weightGroupNames;    // 加权投票：权重分组名称
        uint256[] weightGroupWeights; // 加权投票：权重分组权重值
    }

    /// @notice 投票详情结构（包含聚合数据）
    struct VotingDetails {
        uint256 id;
        address creator;
        string title;
        string description;
        string[] options;
        VotingRule votingRule;
        PrivacyLevel privacyLevel;
        VotingState state;
        uint256 registrationStart;
        uint256 registrationEnd;
        uint256 votingStart;
        uint256 votingEnd;
        uint256 quorum;
        uint256 totalVoters;
        uint256 totalVotes;
        uint256[] voteCounts;
        bool resultRevealed;
        uint256 createdAt;
        bool autoAdvance;  // 是否自动推进状态
        uint16 visibilityBitmap;  // 可见性配置位图
        string[] weightGroupNames;    // 加权投票：权重分组名称
        uint256[] weightGroupWeights; // 加权投票：权重分组权重值
    }

    /// @notice 创建投票参数结构
    struct CreateVotingParams {
        string title;
        string description;
        string[] options;
        VotingRule votingRule;
        PrivacyLevel privacyLevel;
        uint256 registrationStart;
        uint256 registrationEnd;
        uint256 votingStart;
        uint256 votingEnd;
        uint256 quorum;
        bool autoAdvance;  // 是否自动推进状态
        uint16 visibilityBitmap;  // 可见性配置位图
        bool enableWhitelist;  // 是否启用白名单
        address[] whitelist;   // 白名单地址列表（预注册，可直接投票）
        uint256[] whitelistGroupIndexes; // 白名单地址对应的权重分组索引（加权+白名单时使用）
        string[] weightGroupNames;    // 加权投票：权重分组名称
        uint256[] weightGroupWeights; // 加权投票：权重分组权重值
    }

    // ==================== 模块化中心合约 ====================
    
    /// @notice 注册中心合约
    RegistrationCenter public registrationCenter;
    
    /// @notice 计票中心合约
    VotingCenter public votingCenter;
    
    /// @notice 揭示中心合约
    RevealCenter public revealCenter;
    
    /// @notice 统计中心合约
    StatisticsCenter public statisticsCenter;

    /// @notice 投票计数器
    uint256 public votingCount;

    /// @notice 投票ID => 投票基本信息
    mapping(uint256 => VotingInfo) private votings;
    
    /// @notice 创建者 => 投票ID列表
    mapping(address => uint256[]) private creatorVotings;
    
    /// @notice 选民 => 参与的投票ID列表
    mapping(address => uint256[]) private voterParticipations;

    /// @notice 合约所有者
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier votingExists(uint256 votingId) {
        require(votingId > 0 && votingId <= votingCount, "Voting does not exist");
        _;
    }

    modifier inState(uint256 votingId, VotingState state) {
        require(votings[votingId].state == state, "Invalid state");
        _;
    }

    // ==================== 惰性状态计算（零 Gas 成本） ====================

    /**
     * @notice 获取投票的有效状态（根据时间自动计算，仅对自动推进模式生效）
     * @param votingId 投票ID
     * @return 计算后的有效状态
     * @dev 自动推进模式：根据时间自动计算状态；手动模式：返回存储的状态
     */
    function getEffectiveState(uint256 votingId) 
        public 
        view 
        votingExists(votingId)
        returns (VotingState) 
    {
        VotingInfo storage voting = votings[votingId];
        
        // 手动模式：直接返回存储的状态
        if (!voting.autoAdvance) {
            return voting.state;
        }

        // 已经是最终状态，直接返回
        if (voting.state == VotingState.Finalized) {
            return VotingState.Finalized;
        }

        // 自动推进模式：根据时间计算状态
        // 注意：Tallying 状态需要实际调用来揭示结果，所以在投票结束后返回 Tallying
        if (block.timestamp > voting.votingEnd) {
            // 如果结果已经揭示（存储状态为 Finalized），返回 Finalized
            // 否则返回 Tallying，等待调用 revealResult
            return VotingState.Tallying;
        }
        
        if (block.timestamp >= voting.votingStart) {
            return VotingState.Voting;
        }
        
        if (block.timestamp >= voting.registrationStart) {
            return VotingState.Registration;
        }
        
        return VotingState.Created;
    }

    /**
     * @notice 检查是否可以执行注册操作（基于有效状态）
     * @param votingId 投票ID
     * @return 是否可以注册
     */
    function canRegister(uint256 votingId) public view votingExists(votingId) returns (bool) {
        VotingState effectiveState = getEffectiveState(votingId);
        VotingInfo storage voting = votings[votingId];
        return effectiveState == VotingState.Registration && 
               block.timestamp <= voting.registrationEnd;
    }

    /**
     * @notice 检查是否可以执行投票操作（基于有效状态）
     * @param votingId 投票ID
     * @return 是否可以投票
     */
    function canVote(uint256 votingId) public view votingExists(votingId) returns (bool) {
        VotingState effectiveState = getEffectiveState(votingId);
        VotingInfo storage voting = votings[votingId];
        return effectiveState == VotingState.Voting && 
               block.timestamp <= voting.votingEnd;
    }

    /**
     * @notice 检查是否可以揭示结果
     * @param votingId 投票ID
     * @return 是否可以揭示结果
     */
    function canRevealResult(uint256 votingId) public view votingExists(votingId) returns (bool) {
        VotingState effectiveState = getEffectiveState(votingId);
        return effectiveState == VotingState.Tallying;
    }

    /**
     * @notice 构造函数
     * @param _registrationCenter 注册中心合约地址
     * @param _votingCenter 计票中心合约地址
     * @param _revealCenter 揭示中心合约地址
     * @param _statisticsCenter 统计中心合约地址
     */
    constructor(
        address _registrationCenter,
        address _votingCenter,
        address _revealCenter,
        address _statisticsCenter
    ) {
        owner = msg.sender;
        registrationCenter = RegistrationCenter(_registrationCenter);
        votingCenter = VotingCenter(_votingCenter);
        revealCenter = RevealCenter(_revealCenter);
        statisticsCenter = StatisticsCenter(_statisticsCenter);
    }

    /**
     * @notice 创建新投票
     * @param params 创建参数
     * @return votingId 新投票的ID
     */
    function createVoting(CreateVotingParams calldata params) external returns (uint256 votingId) {
        require(bytes(params.title).length > 0, "Title required");
        require(params.options.length >= 2, "At least 2 options");
        require(params.registrationEnd > params.registrationStart, "Invalid registration period");
        require(params.votingEnd > params.votingStart, "Invalid voting period");
        require(params.votingStart >= params.registrationEnd, "Voting must start after registration");

        votingCount++;
        votingId = votingCount;

        // 存储投票基本信息
        VotingInfo storage voting = votings[votingId];
        voting.id = votingId;
        voting.creator = msg.sender;
        voting.title = params.title;
        voting.description = params.description;
        voting.votingRule = params.votingRule;
        voting.privacyLevel = params.privacyLevel;
        voting.state = VotingState.Created;
        voting.registrationStart = params.registrationStart;
        voting.registrationEnd = params.registrationEnd;
        voting.votingStart = params.votingStart;
        voting.votingEnd = params.votingEnd;
        voting.quorum = params.quorum;
        voting.createdAt = block.timestamp;
        voting.autoAdvance = params.autoAdvance;
        voting.visibilityBitmap = params.visibilityBitmap;

        // 加权投票：存储权重分组
        if (params.votingRule == VotingRule.Weighted) {
            require(params.weightGroupNames.length > 0, "Weighted voting requires weight groups");
            require(params.weightGroupNames.length == params.weightGroupWeights.length, "Weight groups mismatch");
            for (uint256 i = 0; i < params.weightGroupNames.length; i++) {
                require(params.weightGroupWeights[i] > 0, "Weight must be > 0");
                voting.weightGroupNames.push(params.weightGroupNames[i]);
                voting.weightGroupWeights.push(params.weightGroupWeights[i]);
            }
        }

        // 存储选项
        for (uint256 i = 0; i < params.options.length; i++) {
            voting.options.push(params.options[i]);
        }

        // 初始化计票中心的选项数量
        votingCenter.initializeProposal(votingId, params.options.length);

        // 如果启用白名单，批量预注册白名单地址
        if (params.enableWhitelist && params.whitelist.length > 0) {
            require(params.whitelist.length <= 200, "Whitelist too large (max 200)");
            // 加权投票 + 白名单：按分组注册并设置权重
            if (params.votingRule == VotingRule.Weighted && params.whitelistGroupIndexes.length > 0) {
                require(params.whitelistGroupIndexes.length == params.whitelist.length, "Whitelist group indexes length mismatch");
                // 构建每个地址的权重数组
                uint256[] memory weights = new uint256[](params.whitelist.length);
                for (uint256 i = 0; i < params.whitelist.length; i++) {
                    require(params.whitelistGroupIndexes[i] < params.weightGroupNames.length, "Invalid group index in whitelist");
                    weights[i] = params.weightGroupWeights[params.whitelistGroupIndexes[i]];
                }
                registrationCenter.batchRegisterVotersWithWeight(votingId, params.whitelist, weights, params.whitelistGroupIndexes);
            } else {
                registrationCenter.batchRegisterVoters(votingId, params.whitelist);
            }
        }

        // 记录创建者的投票
        creatorVotings[msg.sender].push(votingId);

        // 更新统计中心
        if (address(statisticsCenter) != address(0)) {
            statisticsCenter.recordVotingCreated(
                votingId,
                msg.sender,
                params.votingRule,
                params.privacyLevel,
                params.autoAdvance
            );
        }

        emit VotingCreated(votingId, msg.sender, params.title, block.timestamp);
        
        return votingId;
    }

    /**
     * @notice 开始注册阶段
     * @param votingId 投票ID
     * @dev 手动模式：创建者随时可推进，无时间限制；自动模式：需要满足时间条件
     */
    function startRegistration(uint256 votingId) 
        external 
        votingExists(votingId)
        inState(votingId, VotingState.Created)
    {
        VotingInfo storage voting = votings[votingId];
        
        if (voting.autoAdvance) {
            // 自动模式：需要满足时间条件
            require(block.timestamp >= voting.registrationStart, "Too early");
        } else {
            // 手动模式：只需创建者权限，无时间限制
            require(
                msg.sender == voting.creator || msg.sender == owner,
                "Not authorized"
            );
        }

        voting.state = VotingState.Registration;
        emit StateChanged(votingId, VotingState.Registration);
    }

    /**
     * @notice 注册为选民 - 调用 RegistrationCenter
     * @param votingId 投票ID
     * @dev 自动推进模式使用有效状态检查，手动模式使用存储状态检查
     */
    function registerVoter(uint256 votingId)
        external
        votingExists(votingId)
    {
        VotingInfo storage voting = votings[votingId];
        
        // 自动推进模式：使用有效状态检查（包含时间限制）
        if (voting.autoAdvance) {
            require(canRegister(votingId), "Registration not open");
        } else {
            // 手动模式：只检查状态，无时间限制
            require(voting.state == VotingState.Registration, "Invalid state");
        }

        // 调用注册中心进行注册
        bool success = registrationCenter.registerVoter(votingId, msg.sender);
        require(success, "Registration failed");

        // 记录用户参与的投票
        voterParticipations[msg.sender].push(votingId);

        // 更新统计中心
        if (address(statisticsCenter) != address(0)) {
            statisticsCenter.recordVoterRegistered(votingId, msg.sender);
        }

        emit VoterRegistered(votingId, msg.sender);
    }

    /**
     * @notice 注册为选民（加权投票 - 选择权重分组）
     * @param votingId 投票ID
     * @param groupIndex 权重分组索引
     * @dev 仅在投票规则为 Weighted 时使用
     */
    function registerVoterWeighted(uint256 votingId, uint256 groupIndex)
        external
        votingExists(votingId)
    {
        VotingInfo storage voting = votings[votingId];
        
        // 必须是加权投票
        require(voting.votingRule == VotingRule.Weighted, "Not weighted voting");
        require(groupIndex < voting.weightGroupWeights.length, "Invalid group index");
        
        // 自动推进模式：使用有效状态检查（包含时间限制）
        if (voting.autoAdvance) {
            require(canRegister(votingId), "Registration not open");
        } else {
            // 手动模式：只检查状态，无时间限制
            require(voting.state == VotingState.Registration, "Invalid state");
        }

        // 获取分组权重
        uint256 weight = voting.weightGroupWeights[groupIndex];

        // 调用注册中心进行带权重注册
        bool success = registrationCenter.registerVoterWithWeight(votingId, msg.sender, weight, groupIndex);
        require(success, "Registration failed");

        // 记录用户参与的投票
        voterParticipations[msg.sender].push(votingId);

        // 更新统计中心
        if (address(statisticsCenter) != address(0)) {
            statisticsCenter.recordVoterRegistered(votingId, msg.sender);
        }

        emit VoterRegistered(votingId, msg.sender);
    }

    /**
     * @notice 开始投票阶段
     * @param votingId 投票ID
     * @dev 手动模式：创建者随时可推进，无时间限制；自动模式：需要满足时间条件
     */
    function startVoting(uint256 votingId)
        external
        votingExists(votingId)
        inState(votingId, VotingState.Registration)
    {
        VotingInfo storage voting = votings[votingId];
        
        if (voting.autoAdvance) {
            // 自动模式：需要满足时间条件
            require(block.timestamp >= voting.votingStart, "Too early");
        } else {
            // 手动模式：只需创建者权限，无时间限制
            require(
                msg.sender == voting.creator || msg.sender == owner,
                "Not authorized"
            );
        }

        voting.state = VotingState.Voting;
        emit StateChanged(votingId, VotingState.Voting);
    }

    /**
     * @notice 投票 - 调用 VotingCenter
     * @param votingId 投票ID
     * @param optionIndex 选项索引
     * @dev 自动推进模式使用有效状态检查，手动模式使用存储状态检查
     */
    function castVote(uint256 votingId, uint256 optionIndex)
        external
        votingExists(votingId)
    {
        VotingInfo storage voting = votings[votingId];

        // 排序选择和二次方投票需要使用专用函数
        require(voting.votingRule != VotingRule.RankedChoice, "Use castRankedVote for ranked choice");
        require(voting.votingRule != VotingRule.Quadratic, "Use castQuadraticVote for quadratic");
        
        // 自动推进模式：使用有效状态检查（包含时间限制）
        if (voting.autoAdvance) {
            require(canVote(votingId), "Voting not open");
        } else {
            // 手动模式：只检查状态，无时间限制
            require(voting.state == VotingState.Voting, "Invalid state");
        }
        
        // 检查是否已注册 - 调用注册中心
        require(
            registrationCenter.isEligibleVoter(votingId, msg.sender),
            "Not registered"
        );

        // 获取选民权重（简单多数默认为1，加权投票为分组权重）
        uint256 weight = registrationCenter.getVoterWeight(votingId, msg.sender);

        // 调用计票中心进行投票（传递权重）
        bool success = votingCenter.castVote(votingId, msg.sender, optionIndex, weight);
        require(success, "Vote failed");

        // 更新统计中心
        if (address(statisticsCenter) != address(0)) {
            statisticsCenter.recordVoteCast(votingId, msg.sender);
        }

        emit VoteCast(votingId, msg.sender, optionIndex);
    }

    /**
     * @notice 二次方投票（多选项分配积分）
     * @param votingId 投票ID
     * @param optionIndexes 选项索引数组
     * @param voteAmounts 每个选项的投票数量
     */
    function castQuadraticVote(
        uint256 votingId,
        uint256[] calldata optionIndexes,
        uint256[] calldata voteAmounts
    )
        external
        votingExists(votingId)
    {
        VotingInfo storage voting = votings[votingId];

        // 验证投票规则必须是二次方投票
        require(voting.votingRule == VotingRule.Quadratic, "Not quadratic voting");

        // 状态检查（复用 castVote 逻辑）
        if (voting.autoAdvance) {
            require(canVote(votingId), "Voting not open");
        } else {
            require(voting.state == VotingState.Voting, "Invalid state");
        }

        // 检查是否已注册
        require(
            registrationCenter.isEligibleVoter(votingId, msg.sender),
            "Not registered"
        );

        // 调用计票中心进行二次方投票（固定100积分）
        bool success = votingCenter.castQuadraticVote(
            votingId,
            msg.sender,
            optionIndexes,
            voteAmounts,
            100 // 固定100积分
        );
        require(success, "Quadratic vote failed");

        // 更新统计中心
        if (address(statisticsCenter) != address(0)) {
            statisticsCenter.recordVoteCast(votingId, msg.sender);
        }

        // 使用第一个选项作为事件中的 optionIndex
        emit VoteCast(votingId, msg.sender, optionIndexes[0]);
    }

    /**
     * @notice 排序选择投票（选民对所有选项按偏好排序）
     * @param votingId 投票ID
     * @param rankedOptions 按偏好排序的选项索引数组（第1选择在前）
     */
    function castRankedVote(
        uint256 votingId,
        uint256[] calldata rankedOptions
    )
        external
        votingExists(votingId)
    {
        VotingInfo storage voting = votings[votingId];

        // 验证投票规则必须是排序选择
        require(voting.votingRule == VotingRule.RankedChoice, "Not ranked choice voting");

        // 状态检查
        if (voting.autoAdvance) {
            require(canVote(votingId), "Voting not open");
        } else {
            require(voting.state == VotingState.Voting, "Invalid state");
        }

        // 检查是否已注册
        require(
            registrationCenter.isEligibleVoter(votingId, msg.sender),
            "Not registered"
        );

        // 调用计票中心
        bool success = votingCenter.castRankedVote(votingId, msg.sender, rankedOptions);
        require(success, "Ranked vote failed");

        // 更新统计中心
        if (address(statisticsCenter) != address(0)) {
            statisticsCenter.recordVoteCast(votingId, msg.sender);
        }

        emit VoteCast(votingId, msg.sender, rankedOptions[0]);
    }

    /**
     * @notice 开始计票
     * @param votingId 投票ID
     * @dev 手动模式：创建者随时可推进，无时间限制；自动模式：需要满足时间条件
     */
    function startTallying(uint256 votingId)
        external
        votingExists(votingId)
        inState(votingId, VotingState.Voting)
    {
        VotingInfo storage voting = votings[votingId];
        
        if (voting.autoAdvance) {
            // 自动模式：需要满足时间条件
            require(block.timestamp > voting.votingEnd, "Voting not ended");
        } else {
            // 手动模式：只需创建者权限，无时间限制
            require(
                msg.sender == voting.creator || msg.sender == owner,
                "Not authorized"
            );
        }

        voting.state = VotingState.Tallying;
        emit StateChanged(votingId, VotingState.Tallying);
    }

    /**
     * @notice 揭示结果 - 调用 RevealCenter
     * @param votingId 投票ID
     * @dev 自动推进模式使用有效状态检查，手动模式使用存储状态检查
     */
    function revealResult(uint256 votingId)
        external
        votingExists(votingId)
    {
        VotingInfo storage voting = votings[votingId];
        
        // 自动推进模式：使用有效状态检查
        if (voting.autoAdvance) {
            require(canRevealResult(votingId), "Cannot reveal result yet");
        } else {
            // 手动模式：使用存储状态检查
            require(voting.state == VotingState.Tallying, "Invalid state");
            require(
                msg.sender == voting.creator || msg.sender == owner,
                "Not authorized"
            );
        }

        // 从计票中心获取投票结果
        uint256[] memory voteCounts;
        if (voting.votingRule == VotingRule.RankedChoice) {
            // 排序选择：使用 IRV 多轮淘汰算法计算最终票数
            voteCounts = votingCenter.computeRankedResult(votingId);
            // 将 IRV 最终票数回写到 voteCounts，使前端查询时能正确显示
            votingCenter.writeRankedResultCounts(votingId, voteCounts);
        } else {
            voteCounts = votingCenter.getAllVoteCounts(votingId);
        }
        uint256 totalVoters = registrationCenter.getVoterCount(votingId);

        // 调用揭示中心揭示结果
        RevealCenter.VotingResult memory result = revealCenter.revealResult(
            votingId,
            voteCounts,
            totalVoters,
            voting.quorum
        );

        voting.state = VotingState.Finalized;

        // 更新统计中心
        if (address(statisticsCenter) != address(0)) {
            statisticsCenter.recordVotingCompleted(votingId);
        }

        emit ResultRevealed(votingId, result.winningOption);
        emit StateChanged(votingId, VotingState.Finalized);
    }

    // ==================== 查询函数 ====================

    /**
     * @notice 获取投票详情（聚合所有中心合约的数据）
     * @param votingId 投票ID
     * @return 投票详情
     * @dev 自动推进模式返回计算后的有效状态，手动模式返回存储状态
     */
    function getVoting(uint256 votingId) 
        external 
        view 
        votingExists(votingId)
        returns (VotingDetails memory) 
    {
        VotingInfo storage info = votings[votingId];
        
        // 从各中心合约获取数据
        uint256 totalVoters = registrationCenter.getVoterCount(votingId);
        uint256 totalVotes = votingCenter.getTotalVotes(votingId);
        uint256[] memory voteCounts = votingCenter.getAllVoteCounts(votingId);
        bool resultRevealed = revealCenter.isResultRevealed(votingId);

        // 获取有效状态（自动推进模式根据时间计算，手动模式返回存储状态）
        VotingState effectiveState = getEffectiveState(votingId);

        return VotingDetails({
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
            weightGroupWeights: info.weightGroupWeights
        });
    }

    /**
     * @notice 获取所有投票ID列表
     * @return 投票ID数组
     */
    function getAllVotingIds() external view returns (uint256[] memory) {
        uint256[] memory ids = new uint256[](votingCount);
        for (uint256 i = 0; i < votingCount; i++) {
            ids[i] = i + 1;
        }
        return ids;
    }

    /**
     * @notice 获取最近N个投票
     * @param count 数量
     * @return 投票详情数组
     */
    function getRecentVotings(uint256 count) external view returns (VotingDetails[] memory) {
        uint256 resultCount = count > votingCount ? votingCount : count;
        VotingDetails[] memory result = new VotingDetails[](resultCount);
        
        for (uint256 i = 0; i < resultCount; i++) {
            uint256 votingId = votingCount - i;
            result[i] = this.getVoting(votingId);
        }
        
        return result;
    }

    /**
     * @notice 获取用户创建的投票
     * @param creator 创建者地址
     * @return 投票ID数组
     */
    function getVotingsByCreator(address creator) external view returns (uint256[] memory) {
        return creatorVotings[creator];
    }

    /**
     * @notice 获取用户参与的投票
     * @param voter 选民地址
     * @return 投票ID数组
     */
    function getVotingsByVoter(address voter) external view returns (uint256[] memory) {
        return voterParticipations[voter];
    }

    /**
     * @notice 获取投票选项
     * @param votingId 投票ID
     * @return 选项数组
     */
    function getVotingOptions(uint256 votingId) 
        external 
        view 
        votingExists(votingId)
        returns (string[] memory) 
    {
        return votings[votingId].options;
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
        votingExists(votingId)
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
     * @notice 检查用户的投票状态 - 从各中心合约获取
     * @param votingId 投票ID
     * @param user 用户地址
     * @return registered 是否注册
     * @return voted 是否已投票
     */
    function getUserVotingStatus(uint256 votingId, address user)
        external
        view
        votingExists(votingId)
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
     * @dev 自动推进模式返回计算后的有效状态，手动模式返回存储状态
     */
    function getVotingState(uint256 votingId)
        external
        view
        votingExists(votingId)
        returns (VotingState)
    {
        return getEffectiveState(votingId);
    }

    /**
     * @notice 批量获取投票详情
     * @param votingIds 投票ID数组
     * @return 投票详情数组
     */
    function getVotingsBatch(uint256[] calldata votingIds) 
        external 
        view 
        returns (VotingDetails[] memory) 
    {
        VotingDetails[] memory result = new VotingDetails[](votingIds.length);
        
        for (uint256 i = 0; i < votingIds.length; i++) {
            if (votingIds[i] > 0 && votingIds[i] <= votingCount) {
                result[i] = this.getVoting(votingIds[i]);
            }
        }
        
        return result;
    }

    /**
     * @notice 检查用户是否已注册 - 代理到 RegistrationCenter
     */
    function isRegistered(uint256 votingId, address voter) 
        external 
        view 
        returns (bool) 
    {
        return registrationCenter.isEligibleVoter(votingId, voter);
    }

    /**
     * @notice 检查用户是否已投票 - 代理到 VotingCenter
     */
    function hasVoted(uint256 votingId, address voter) 
        external 
        view 
        returns (bool) 
    {
        return votingCenter.hasVoterVoted(votingId, voter);
    }

    /**
     * @notice 获取投票记录 - 代理到 VotingCenter
     * @param votingId 投票ID
     * @return voters 投票者地址数组
     * @return optionIndexes 选项索引数组
     * @return timestamps 时间戳数组
     */
    function getVoteRecords(uint256 votingId)
        external
        view
        votingExists(votingId)
        returns (
            address[] memory voters,
            uint256[] memory optionIndexes,
            uint256[] memory timestamps
        )
    {
        return votingCenter.getVoteRecords(votingId);
    }

    /**
     * @notice 获取排序选择投票的完整记录 - 代理到 VotingCenter
     * @param votingId 投票ID
     * @return voters 投票者地址数组
     * @return rankings 每位投票者的完整排名
     * @return timestamps 时间戳数组
     */
    function getRankedVoteRecords(uint256 votingId)
        external
        view
        votingExists(votingId)
        returns (
            address[] memory voters,
            uint256[][] memory rankings,
            uint256[] memory timestamps
        )
    {
        return votingCenter.getRankedVoteRecords(votingId);
    }

    /**
     * @notice 获取特定选民的投票选择 - 代理到 VotingCenter
     * @param votingId 投票ID
     * @param voter 选民地址
     * @return optionIndex 投票选项
     * @return timestamp 投票时间
     * @return voted 是否已投票
     */
    function getVoterChoice(uint256 votingId, address voter)
        external
        view
        votingExists(votingId)
        returns (
            uint256 optionIndex,
            uint256 timestamp,
            bool voted
        )
    {
        return votingCenter.getVoterChoice(votingId, voter);
    }

    // ==================== 管理函数 ====================

    /**
     * @notice 更新中心合约地址（仅限所有者）
     */
    function updateCenters(
        address _registrationCenter,
        address _votingCenter,
        address _revealCenter,
        address _statisticsCenter
    ) external onlyOwner {
        if (_registrationCenter != address(0)) {
            registrationCenter = RegistrationCenter(_registrationCenter);
        }
        if (_votingCenter != address(0)) {
            votingCenter = VotingCenter(_votingCenter);
        }
        if (_revealCenter != address(0)) {
            revealCenter = RevealCenter(_revealCenter);
        }
        if (_statisticsCenter != address(0)) {
            statisticsCenter = StatisticsCenter(_statisticsCenter);
        }
    }

    /**
     * @notice 获取各中心合约地址
     */
    function getCenterAddresses() 
        external 
        view 
        returns (
            address registration,
            address voting,
            address reveal,
            address statistics
        ) 
    {
        return (
            address(registrationCenter),
            address(votingCenter),
            address(revealCenter),
            address(statisticsCenter)
        );
    }
}
