// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IVotingTypes.sol";
import "./RegistrationCenter.sol";
import "./VotingCenter.sol";
import "./RevealCenter.sol";
import "./StatisticsCenter.sol";

/**
 * @notice ERC-20/ERC-721 通用接口（仅 balanceOf）
 * @dev 用于 NFT 持有者 / Token 持有者注册规则验证
 */
interface IERC20OrNFT {
    function balanceOf(address owner) external view returns (uint256);
}

/**
 * @notice 匿名投票合约接口
 */
interface IAnonymousVoting {
    function createGroups(uint256 votingId, IVotingTypes.VotingRule votingRule, uint256 weightGroupCount) external;
}

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

    /// @notice 注册申请事件（审核模式）
    event RegistrationRequested(uint256 indexed votingId, address indexed voter);
    
    /// @notice 注册审批通过事件
    event RegistrationApproved(uint256 indexed votingId, address indexed voter);
    
    /// @notice 注册拒绝事件
    event RegistrationRejected(uint256 indexed votingId, address indexed voter);

    /// @notice 投票取消事件
    event VotingCancelled(uint256 indexed votingId, address indexed cancelledBy);

    /// @notice 匿名投票事件（不包含 voter 地址）
    event AnonymousVoteCast(uint256 indexed votingId, uint256 optionIndex, uint256 nullifierHash);

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
        RegistrationRule registrationRule;  // 注册规则
        address tokenContractAddress;  // NFT/Token 合约地址（NFTHolder/TokenHolder 模式使用）
        uint256 tokenMinBalance;       // 最低持有数量（NFTHolder 默认1，TokenHolder 由创建者设定）
        bool useBlockNumber;           // 时间控制：true=用区块高度，false=用时间戳
        bool allowExtension;          // 是否允许动态延长注册期/投票期
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
        RegistrationRule registrationRule;  // 注册规则
        address tokenContractAddress;  // NFT/Token 合约地址
        uint256 tokenMinBalance;       // 最低持有数量
        bool useBlockNumber;           // 时间控制：true=用区块高度，false=用时间戳
        bool allowExtension;           // 是否允许动态延长注册期/投票期
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
        RegistrationRule registrationRule;  // 注册规则
        address tokenContractAddress;  // NFT/Token 合约地址（NFTHolder/TokenHolder 模式使用）
        uint256 tokenMinBalance;       // 最低持有数量
        bool useBlockNumber;            // 时间控制：true=用区块高度，false=用时间戳
        bool allowExtension;            // 是否允许动态延长注册期/投票期
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

    /// @notice 匿名投票合约（Semaphore 群组与匿名注册/投票逻辑已拆分至此）
    address public anonymousVoting;

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
        
        // 取消状态：无论手动/自动均直接返回
        if (voting.state == VotingState.Cancelled) {
            return VotingState.Cancelled;
        }

        // 手动模式：直接返回存储的状态
        if (!voting.autoAdvance) {
            return voting.state;
        }

        // 已经是最终状态，直接返回
        if (voting.state == VotingState.Finalized) {
            return VotingState.Finalized;
        }

        // 自动推进模式：根据时间/区块计算状态
        // 注意：Tallying 状态需要实际调用来揭示结果，所以在投票结束后返回 Tallying
        uint256 nowOrBlock = voting.useBlockNumber ? block.number : block.timestamp;
        if (nowOrBlock > voting.votingEnd) {
            return VotingState.Tallying;
        }
        if (nowOrBlock >= voting.votingStart) {
            return VotingState.Voting;
        }
        if (nowOrBlock >= voting.registrationStart) {
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
        uint256 nowOrBlock = voting.useBlockNumber ? block.number : block.timestamp;
        return effectiveState == VotingState.Registration && nowOrBlock <= voting.registrationEnd;
    }

    /**
     * @notice 检查是否可以执行投票操作（基于有效状态）
     * @param votingId 投票ID
     * @return 是否可以投票
     */
    function canVote(uint256 votingId) public view votingExists(votingId) returns (bool) {
        VotingState effectiveState = getEffectiveState(votingId);
        VotingInfo storage voting = votings[votingId];
        uint256 nowOrBlock = voting.useBlockNumber ? block.number : block.timestamp;
        return effectiveState == VotingState.Voting && nowOrBlock <= voting.votingEnd;
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
     * @notice 设置匿名投票合约地址（匿名投票必需，仅 owner 可设一次）
     *         同时传播到 RegistrationCenter 和 VotingCenter（需由 votingCore 调用）
     */
    function setAnonymousVoting(address _anonymousVoting) external onlyOwner {
        require(anonymousVoting == address(0), "AnonymousVoting already set");
        require(_anonymousVoting != address(0), "Invalid address");
        anonymousVoting = _anonymousVoting;
        registrationCenter.setAnonymousVoting(_anonymousVoting);
        votingCenter.setAnonymousVoting(_anonymousVoting);
    }

    modifier onlyAnonymousVoting() {
        require(msg.sender == anonymousVoting, "Only AnonymousVoting");
        _;
    }

    /**
     * @notice 记录选民参与（供 AnonymousVoting 调用）
     */
    function recordVoterParticipation(address voter, uint256 votingId) external onlyAnonymousVoting {
        voterParticipations[voter].push(votingId);
    }

    /**
     * @notice 发出选民注册事件（供 AnonymousVoting 调用）
     */
    function emitVoterRegistered(uint256 votingId, address voter) external onlyAnonymousVoting {
        emit VoterRegistered(votingId, voter);
    }

    /**
     * @notice 发出匿名投票事件（供 AnonymousVoting 调用）
     */
    function emitAnonymousVoteCast(uint256 votingId, uint256 optionIndex, uint256 nullifierHash) external onlyAnonymousVoting {
        emit AnonymousVoteCast(votingId, optionIndex, nullifierHash);
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
        // 匿名投票：支持简单多数、加权、排序选择、二次方；需开放注册 + 无白名单
        if (params.privacyLevel == PrivacyLevel.Anonymous || params.privacyLevel == PrivacyLevel.FullPrivacy) {
            require(
                params.votingRule == VotingRule.SimpleMajority ||
                params.votingRule == VotingRule.Weighted ||
                params.votingRule == VotingRule.RankedChoice ||
                params.votingRule == VotingRule.Quadratic,
                "Anonymous supports simple majority, weighted, ranked choice, quadratic"
            );
            require(params.registrationRule == RegistrationRule.Open, "Anonymous voting requires open registration");
            require(anonymousVoting != address(0), "AnonymousVoting not configured");
            require(!params.enableWhitelist || params.whitelist.length == 0, "Anonymous voting does not support whitelist");
        }

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
        voting.registrationRule = params.registrationRule;
        voting.useBlockNumber = params.useBlockNumber;
        voting.allowExtension = params.allowExtension;

        // NFT/Token 持有者模式：存储合约地址和最低持有量
        if (params.registrationRule == RegistrationRule.NFTHolder || params.registrationRule == RegistrationRule.TokenHolder) {
            require(params.tokenContractAddress != address(0), "Token contract address required");
            require(params.tokenMinBalance > 0, "Min balance must be > 0");
            voting.tokenContractAddress = params.tokenContractAddress;
            voting.tokenMinBalance = params.tokenMinBalance;
        }

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

        // 匿名投票：委托 AnonymousVoting 创建 Semaphore 群组
        if (params.privacyLevel == PrivacyLevel.Anonymous || params.privacyLevel == PrivacyLevel.FullPrivacy) {
            uint256 weightGroupCount = (params.votingRule == VotingRule.Weighted)
                ? params.weightGroupNames.length
                : 0;
            IAnonymousVoting(anonymousVoting).createGroups(votingId, params.votingRule, weightGroupCount);
        }

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
            uint256 nowOrBlock = voting.useBlockNumber ? block.number : block.timestamp;
            require(nowOrBlock >= voting.registrationStart, "Too early");
        } else {
            require(
                msg.sender == voting.creator || msg.sender == owner,
                "Not authorized"
            );
        }

        voting.state = VotingState.Registration;
        emit StateChanged(votingId, VotingState.Registration);
    }

    /**
     * @notice 取消投票
     * @param votingId 投票ID
     * @dev 仅创建者或 owner 可调用；仅在 Created / Registration / Voting 状态下可取消
     */
    function cancelVoting(uint256 votingId)
        external
        votingExists(votingId)
    {
        VotingInfo storage voting = votings[votingId];
        require(
            msg.sender == voting.creator || msg.sender == owner,
            "Not authorized"
        );
        require(
            voting.state == VotingState.Created ||
            voting.state == VotingState.Registration ||
            voting.state == VotingState.Voting,
            "Cannot cancel in this state"
        );

        voting.state = VotingState.Cancelled;
        emit VotingCancelled(votingId, msg.sender);
        emit StateChanged(votingId, VotingState.Cancelled);
    }

    /**
     * @notice 延长注册截止时间
     * @param votingId 投票ID
     * @param newEnd 新的注册截止时间（时间戳或区块号，与创建时 useBlockNumber 一致）
     * @dev 仅创建者可调；仅在 Registration 状态且 newEnd > 当前 registrationEnd 时有效
     */
    function extendRegistrationEnd(uint256 votingId, uint256 newEnd)
        external
        votingExists(votingId)
    {
        VotingInfo storage voting = votings[votingId];
        require(voting.allowExtension, "Extension disabled");
        require(msg.sender == voting.creator || msg.sender == owner, "Not authorized");
        require(voting.state == VotingState.Registration, "Must be in Registration");
        require(newEnd > voting.registrationEnd, "newEnd must be later");

        voting.registrationEnd = newEnd;
    }

    /**
     * @notice 延长投票截止时间
     * @param votingId 投票ID
     * @param newEnd 新的投票截止时间（时间戳或区块号，与创建时 useBlockNumber 一致）
     * @dev 仅创建者可调；仅在 Voting 状态且 newEnd > 当前 votingEnd 时有效
     */
    function extendVotingEnd(uint256 votingId, uint256 newEnd)
        external
        votingExists(votingId)
    {
        VotingInfo storage voting = votings[votingId];
        require(voting.allowExtension, "Extension disabled");
        require(msg.sender == voting.creator || msg.sender == owner, "Not authorized");
        require(voting.state == VotingState.Voting, "Must be in Voting");
        require(newEnd > voting.votingEnd, "newEnd must be later");

        voting.votingEnd = newEnd;
    }

    /**
     * @notice 注册为选民 - 调用 RegistrationCenter
     * @param votingId 投票ID
     * @dev 自动推进模式使用有效状态检查，手动模式使用存储状态检查
     *      审核模式下，此函数会将选民加入待审核列表而非直接注册
     */
    function registerVoter(uint256 votingId)
        external
        votingExists(votingId)
    {
        VotingInfo storage voting = votings[votingId];
        require(
            voting.privacyLevel != PrivacyLevel.Anonymous && voting.privacyLevel != PrivacyLevel.FullPrivacy,
            "Use registerVoterAnonymous for anonymous voting"
        );
        
        // 自动推进模式：使用有效状态检查（包含时间限制）
        if (voting.autoAdvance) {
            require(canRegister(votingId), "Registration not open");
        } else {
            // 手动模式：只检查状态，无时间限制
            require(voting.state == VotingState.Registration, "Invalid state");
        }

        // 审核模式：进入待审核列表
        if (voting.registrationRule == RegistrationRule.Approval) {
            require(
                registrationCenter.requestRegistration(votingId, msg.sender),
                "Registration request failed"
            );
            emit RegistrationRequested(votingId, msg.sender);
            return;
        }

        // NFT/Token 持有者模式：验证链上持有量
        if (voting.registrationRule == RegistrationRule.NFTHolder || voting.registrationRule == RegistrationRule.TokenHolder) {
            require(voting.tokenContractAddress != address(0), "Token contract not set");
            IERC20OrNFT token = IERC20OrNFT(voting.tokenContractAddress);
            require(token.balanceOf(msg.sender) >= voting.tokenMinBalance, "Insufficient token balance");
        }

        // 直接注册（开放 / NFT / Token 模式均走此路径）
        require(
            registrationCenter.registerVoter(votingId, msg.sender),
            "Registration failed"
        );

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
     *      审核模式下，此函数会将选民加入待审核列表而非直接注册
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

        // 审核模式：进入待审核列表（带权重信息）
        if (voting.registrationRule == RegistrationRule.Approval) {
            require(
                registrationCenter.requestRegistrationWeighted(votingId, msg.sender, weight, groupIndex),
                "Registration request failed"
            );
            emit RegistrationRequested(votingId, msg.sender);
            return;
        }

        // NFT/Token 持有者模式：验证链上持有量
        if (voting.registrationRule == RegistrationRule.NFTHolder || voting.registrationRule == RegistrationRule.TokenHolder) {
            require(voting.tokenContractAddress != address(0), "Token contract not set");
            IERC20OrNFT token = IERC20OrNFT(voting.tokenContractAddress);
            require(token.balanceOf(msg.sender) >= voting.tokenMinBalance, "Insufficient token balance");
        }

        // 直接注册（开放 / NFT / Token 模式均走此路径）
        require(
            registrationCenter.registerVoterWithWeight(votingId, msg.sender, weight, groupIndex),
            "Registration failed"
        );

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
            uint256 nowOrBlock = voting.useBlockNumber ? block.number : block.timestamp;
            require(nowOrBlock >= voting.votingStart, "Too early");
        } else {
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
        require(
            voting.privacyLevel != PrivacyLevel.Anonymous && voting.privacyLevel != PrivacyLevel.FullPrivacy,
            "Use castVoteAnonymous for anonymous voting"
        );

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
            uint256 nowOrBlock = voting.useBlockNumber ? block.number : block.timestamp;
            require(nowOrBlock > voting.votingEnd, "Voting not ended");
        } else {
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

    // ==================== 审核模式函数 ====================

    /**
     * @notice 审批通过注册申请（仅创建者可调用）
     * @param votingId 投票ID
     * @param voter 选民地址
     */
    function approveRegistration(uint256 votingId, address voter)
        external
        votingExists(votingId)
    {
        VotingInfo storage voting = votings[votingId];
        require(
            msg.sender == voting.creator || msg.sender == owner,
            "Not authorized"
        );
        require(voting.registrationRule == RegistrationRule.Approval, "Not approval mode");

        bool success = registrationCenter.approveRegistration(votingId, voter);
        require(success, "Approval failed");

        // 记录用户参与的投票
        voterParticipations[voter].push(votingId);

        // 更新统计中心
        if (address(statisticsCenter) != address(0)) {
            statisticsCenter.recordVoterRegistered(votingId, voter);
        }

        emit RegistrationApproved(votingId, voter);
        emit VoterRegistered(votingId, voter);
    }

    /**
     * @notice 批量审批通过注册申请（仅创建者可调用）
     * @param votingId 投票ID
     * @param voters 选民地址列表
     */
    function batchApproveRegistrations(uint256 votingId, address[] calldata voters)
        external
        votingExists(votingId)
    {
        VotingInfo storage voting = votings[votingId];
        require(
            msg.sender == voting.creator || msg.sender == owner,
            "Not authorized"
        );
        require(voting.registrationRule == RegistrationRule.Approval, "Not approval mode");

        registrationCenter.batchApproveRegistrations(votingId, voters);

        for (uint256 i = 0; i < voters.length; i++) {
            voterParticipations[voters[i]].push(votingId);
            if (address(statisticsCenter) != address(0)) {
                statisticsCenter.recordVoterRegistered(votingId, voters[i]);
            }
            emit RegistrationApproved(votingId, voters[i]);
            emit VoterRegistered(votingId, voters[i]);
        }
    }

    /**
     * @notice 拒绝注册申请（仅创建者可调用）
     * @param votingId 投票ID
     * @param voter 选民地址
     */
    function rejectRegistration(uint256 votingId, address voter)
        external
        votingExists(votingId)
    {
        VotingInfo storage voting = votings[votingId];
        require(
            msg.sender == voting.creator || msg.sender == owner,
            "Not authorized"
        );
        require(voting.registrationRule == RegistrationRule.Approval, "Not approval mode");

        bool success = registrationCenter.rejectRegistration(votingId, voter);
        require(success, "Rejection failed");

        emit RegistrationRejected(votingId, voter);
    }

    // ==================== 查询函数（供 QueryCenter 调用） ====================

    /**
     * @notice 获取投票原始信息（供 QueryCenter 聚合查询使用）
     * @param votingId 投票ID
     * @return 投票基本信息
     */
    function getVotingRaw(uint256 votingId) 
        external 
        view 
        votingExists(votingId)
        returns (VotingInfo memory) 
    {
        return votings[votingId];
    }

    /**
     * @notice 获取用户创建的投票ID列表（供 QueryCenter 使用）
     * @param creator 创建者地址
     * @return 投票ID数组
     */
    function getCreatorVotings(address creator) external view returns (uint256[] memory) {
        return creatorVotings[creator];
    }

    /**
     * @notice 获取用户参与的投票ID列表（供 QueryCenter 使用）
     * @param voter 选民地址
     * @return 投票ID数组
     */
    function getVoterParticipations(address voter) external view returns (uint256[] memory) {
        return voterParticipations[voter];
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
