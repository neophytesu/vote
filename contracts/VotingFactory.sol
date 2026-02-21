// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IVotingTypes.sol";
import "./RegistrationCenter.sol";
import "./VotingCenter.sol";
import "./RevealCenter.sol";
import "./StatisticsCenter.sol";
import "./ExecutionCenter.sol";
import "./types/VotingDataTypes.sol";

/**
 * @notice ERC-20/ERC-721 通用接口（仅 balanceOf）
 * @dev 用于 NFT 持有者 / Token 持有者注册规则验证
 */
interface IERC20OrNFT {
    function balanceOf(address owner) external view returns (uint256);
}

/**
 * @notice 支持历史余额查询的 Token（如 EIP-5805 / OpenZeppelin ERC20Votes）
 * @dev 快照投票时若 token 实现此接口，则使用 getPastVotes(account, snapshotBlock) 作为投票权依据
 */
interface IERC20SnapshotBalance {
    function getPastVotes(address account, uint256 blockNumber) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @notice 匿名投票合约接口
 */
interface IAnonymousVoting {
    function createGroups(uint256 votingId, IVotingTypes.VotingRule votingRule, uint256 weightGroupCount) external;
}

/**
 * @notice 加密投票合约接口
 */
interface IEncryptedVoting {
    function initializeEncryptedVoting(uint256 votingId) external;
}

/**
 * @title VotingFactory
 * @notice 投票工厂合约 - 统一入口，调用三个模块化中心合约
 * @dev 创建和管理投票实例，实际业务由 RegistrationCenter、VotingCenter、RevealCenter 处理
 */
contract VotingFactory is IVotingTypes {

    // ==================== 自定义错误（减少字节码体积） ====================
    error OnlyOwner();
    error VotingDoesNotExist();
    error InvalidState();
    error NotAuthorized();
    error CentersNotConfigured();
    error InvalidAddress();
    error AlreadySet();
    error InvalidParams();
    error AnonymousNotConfigured();
    error EncryptedNotConfigured();
    error WhitelistNotSupported();
    error ThresholdConfigInvalid();
    
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

    /// @notice 加密投票事件（仅选票哈希）
    event EncryptedVoteCast(uint256 indexed votingId, bytes32 ballotHash);

    // 共享类型已迁移到 VotingDataTypes（见 contracts/types/VotingDataTypes.sol）

    // ==================== 模块化中心合约 ====================
    
    /// @notice 注册中心合约
    RegistrationCenter public registrationCenter;
    
    /// @notice 计票中心合约
    VotingCenter public votingCenter;
    
    /// @notice 揭示中心合约
    RevealCenter public revealCenter;
    
    /// @notice 统计中心合约
    StatisticsCenter public statisticsCenter;

    /// @notice 执行中心合约（可选，提案通过后链上执行）
    ExecutionCenter public executionCenter;

    /// @notice 匿名投票合约（Semaphore 群组与匿名注册/投票逻辑已拆分至此）
    address public anonymousVoting;

    /// @notice 加密投票合约（同态加密选票提交与计票结果写入）
    address public encryptedVoting;

    /// @notice 投票计数器
    uint256 public votingCount;

    /// @notice 投票ID => 投票基本信息
    mapping(uint256 => VotingDataTypes.VotingInfo) private votings;
    
    /// @notice 创建者 => 投票ID列表
    mapping(address => uint256[]) private creatorVotings;
    
    /// @notice 选民 => 参与的投票ID列表
    mapping(address => uint256[]) private voterParticipations;

    /// @notice 合约所有者
    address public owner;

    /// @notice 各中心是否已配置（防止未初始化就使用）
    bool public centersConfigured;

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier votingExists(uint256 votingId) {
        if (votingId == 0 || votingId > votingCount) revert VotingDoesNotExist();
        _;
    }

    modifier inState(uint256 votingId, VotingState state) {
        if (votings[votingId].state != state) revert InvalidState();
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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
        
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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
        uint256 nowOrBlock = voting.useBlockNumber ? block.number : block.timestamp;
        return effectiveState == VotingState.Voting && nowOrBlock <= voting.votingEnd;
    }

    /**
     * @notice 检查是否可以揭示结果
     * @param votingId 投票ID
     * @return 是否可以揭示结果（处于 Tallying 且已过揭示延迟期时为 true）
     */
    function canRevealResult(uint256 votingId) public view votingExists(votingId) returns (bool) {
        VotingState effectiveState = getEffectiveState(votingId);
        if (effectiveState != VotingState.Tallying) return false;
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
        if (voting.revealDelay == 0) return true;
        uint256 nowOrBlock = voting.useBlockNumber ? block.number : block.timestamp;
        return nowOrBlock >= voting.votingEnd + voting.revealDelay;
    }

    /**
     * @notice 获取某地址在快照时的 Token/NFT 余额（用于资格与投票权重）
     * @param votingId 投票ID
     * @param account 地址
     * @return 快照区块时的余额；若未使用快照或 token 不支持 getPastVotes 则返回当前余额
     */
    function getSnapshotBalance(uint256 votingId, address account) external view votingExists(votingId) returns (uint256) {
        return _getSnapshotBalance(votings[votingId], account);
    }

    // ==================== V2 只读拆分 getter（供模块解耦依赖） ====================

    function getVotingCoreFields(uint256 votingId)
        external
        view
        votingExists(votingId)
        returns (VotingDataTypes.VotingCoreFields memory)
    {
        VotingDataTypes.VotingInfo storage v = votings[votingId];
        return VotingDataTypes.VotingCoreFields({
            id: v.id,
            creator: v.creator,
            votingRule: v.votingRule,
            privacyLevel: v.privacyLevel,
            state: v.state,
            registrationStart: v.registrationStart,
            registrationEnd: v.registrationEnd,
            votingStart: v.votingStart,
            votingEnd: v.votingEnd,
            quorum: v.quorum,
            createdAt: v.createdAt,
            autoAdvance: v.autoAdvance,
            visibilityBitmap: v.visibilityBitmap,
            registrationRule: v.registrationRule,
            tokenContractAddress: v.tokenContractAddress,
            tokenMinBalance: v.tokenMinBalance,
            useBlockNumber: v.useBlockNumber,
            allowExtension: v.allowExtension,
            snapshotBlockNumber: v.snapshotBlockNumber,
            useThresholdDecryption: v.useThresholdDecryption,
            thresholdT: v.thresholdT,
            revealDelay: v.revealDelay,
            optionsCount: v.options.length,
            weightGroupCount: v.weightGroupWeights.length
        });
    }

    function getVotingText(uint256 votingId)
        external
        view
        votingExists(votingId)
        returns (string memory title, string memory description)
    {
        VotingDataTypes.VotingInfo storage v = votings[votingId];
        return (v.title, v.description);
    }

    function getVotingOptions(uint256 votingId)
        external
        view
        votingExists(votingId)
        returns (string[] memory)
    {
        return votings[votingId].options;
    }

    function getVotingWeights(uint256 votingId)
        external
        view
        votingExists(votingId)
        returns (string[] memory names, uint256[] memory weights)
    {
        VotingDataTypes.VotingInfo storage v = votings[votingId];
        return (v.weightGroupNames, v.weightGroupWeights);
    }

    function getThresholdCommittee(uint256 votingId)
        external
        view
        votingExists(votingId)
        returns (address[] memory)
    {
        return votings[votingId].thresholdCommittee;
    }

    /**
     * @notice 内部：根据投票配置与快照区块计算 account 的余额（资格/权重）
     * @dev snapshotBlockNumber==0 或 token 无 getPastVotes 时用当前 balanceOf；否则用 getPastVotes(account, snapshotBlockNumber)
     */
    function _getSnapshotBalance(VotingDataTypes.VotingInfo storage voting, address account) internal view returns (uint256) {
        if (voting.tokenContractAddress == address(0)) {
            return 0;
        }
        if (voting.snapshotBlockNumber == 0) {
            return IERC20OrNFT(voting.tokenContractAddress).balanceOf(account);
        }
        try IERC20SnapshotBalance(voting.tokenContractAddress).getPastVotes(account, voting.snapshotBlockNumber) returns (uint256 past) {
            return past;
        } catch {
            return IERC20OrNFT(voting.tokenContractAddress).balanceOf(account);
        }
    }

    /**
     * @notice 构造函数（先部署 core，后续通过 setCenters 绑定各中心）
     */
    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice 配置各中心合约地址（仅限所有者，仅可设置一次）
     * @dev 采用 core 先部署、中心后部署的流程，避免中心合约的 votingCore 被抢先设置
     */
    function setCenters(
        address _registrationCenter,
        address _votingCenter,
        address _revealCenter,
        address _statisticsCenter
    ) external onlyOwner {
        if (centersConfigured) revert AlreadySet();
        if (
            _registrationCenter == address(0) ||
            _votingCenter == address(0) ||
            _revealCenter == address(0) ||
            _statisticsCenter == address(0)
        ) revert InvalidAddress();
        registrationCenter = RegistrationCenter(_registrationCenter);
        votingCenter = VotingCenter(_votingCenter);
        revealCenter = RevealCenter(_revealCenter);
        statisticsCenter = StatisticsCenter(_statisticsCenter);
        centersConfigured = true;
    }

    /**
     * @notice 设置匿名投票合约地址（匿名投票必需，仅 owner 可设一次）
     *         同时传播到 RegistrationCenter 和 VotingCenter（需由 votingCore 调用）
     */
    function setAnonymousVoting(address _anonymousVoting) external onlyOwner {
        if (!centersConfigured) revert CentersNotConfigured();
        if (anonymousVoting != address(0)) revert AlreadySet();
        if (_anonymousVoting == address(0)) revert InvalidAddress();
        anonymousVoting = _anonymousVoting;
        registrationCenter.setAnonymousVoting(_anonymousVoting);
        votingCenter.setAnonymousVoting(_anonymousVoting);
    }

    /**
     * @notice 设置加密投票合约地址（仅 owner 可设一次）
     */
    function setEncryptedVoting(address _encryptedVoting) external onlyOwner {
        if (!centersConfigured) revert CentersNotConfigured();
        if (encryptedVoting != address(0)) revert AlreadySet();
        if (_encryptedVoting == address(0)) revert InvalidAddress();
        encryptedVoting = _encryptedVoting;
        votingCenter.setEncryptedVoting(_encryptedVoting);
    }

    /**
     * @notice 设置执行中心合约地址（可选，用于提案通过后的链上执行，仅可设置一次）
     * @param _executionCenter 执行中心合约地址
     */
    function setExecutionCenter(address _executionCenter) external onlyOwner {
        if (address(executionCenter) != address(0)) revert AlreadySet();
        if (_executionCenter != address(0)) {
            executionCenter = ExecutionCenter(payable(_executionCenter));
        }
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

    modifier onlyEncryptedVoting() {
        require(msg.sender == encryptedVoting, "Only EncryptedVoting");
        _;
    }

    /**
     * @notice 发出加密投票事件（供 EncryptedVoting 调用）
     */
    function emitEncryptedVoteCast(uint256 votingId, bytes32 ballotHash) external onlyEncryptedVoting {
        emit EncryptedVoteCast(votingId, ballotHash);
    }

    /**
     * @notice 创建新投票
     * @param params 创建参数
     * @return votingId 新投票的ID
     */
    function createVoting(VotingDataTypes.CreateVotingParams calldata params) external returns (uint256 votingId) {
        if (!centersConfigured) revert CentersNotConfigured();
        if (bytes(params.title).length == 0) revert InvalidParams();
        if (params.options.length < 2) revert InvalidParams();
        if (params.registrationEnd <= params.registrationStart) revert InvalidParams();
        if (params.votingEnd <= params.votingStart) revert InvalidParams();
        if (params.votingStart < params.registrationEnd) revert InvalidParams();
        // 匿名投票：支持简单多数、加权、排序选择、二次方；需开放注册 + 无白名单
        if (params.privacyLevel == PrivacyLevel.Anonymous || params.privacyLevel == PrivacyLevel.FullPrivacy) {
            if (
                params.votingRule != VotingRule.SimpleMajority &&
                params.votingRule != VotingRule.Weighted &&
                params.votingRule != VotingRule.RankedChoice &&
                params.votingRule != VotingRule.Quadratic
            ) revert InvalidParams();
            if (params.registrationRule != RegistrationRule.Open) revert InvalidParams();
            if (anonymousVoting == address(0)) revert AnonymousNotConfigured();
            if (params.enableWhitelist && params.whitelist.length > 0) revert WhitelistNotSupported();
        }
        if (params.privacyLevel == PrivacyLevel.FullPrivacy) {
            if (encryptedVoting == address(0)) revert EncryptedNotConfigured();
        }
        // 加密投票：支持简单多数、加权、排序选择、二次方；需开放注册；无白名单
        if (params.privacyLevel == PrivacyLevel.Encrypted) {
            if (
                params.votingRule != VotingRule.SimpleMajority &&
                params.votingRule != VotingRule.Weighted &&
                params.votingRule != VotingRule.RankedChoice &&
                params.votingRule != VotingRule.Quadratic
            ) revert InvalidParams();
            if (params.registrationRule != RegistrationRule.Open) revert InvalidParams();
            if (encryptedVoting == address(0)) revert EncryptedNotConfigured();
            if (params.enableWhitelist && params.whitelist.length > 0) revert WhitelistNotSupported();
            if (params.useThresholdDecryption) {
                if (params.thresholdCommittee.length == 0) revert ThresholdConfigInvalid();
                if (params.thresholdT == 0 || params.thresholdT > params.thresholdCommittee.length) revert ThresholdConfigInvalid();
                if (params.thresholdCommittee.length > 50) revert ThresholdConfigInvalid();
            }
        }
        if (params.privacyLevel == PrivacyLevel.FullPrivacy && params.useThresholdDecryption) {
            if (params.thresholdCommittee.length == 0) revert ThresholdConfigInvalid();
            if (params.thresholdT == 0 || params.thresholdT > params.thresholdCommittee.length) revert ThresholdConfigInvalid();
            if (params.thresholdCommittee.length > 50) revert ThresholdConfigInvalid();
        }

        votingCount++;
        votingId = votingCount;

        // 存储投票基本信息
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
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
        voting.revealDelay = params.revealDelay;

        // 加密/完全隐私投票可选：阈值解密（t-of-n 委员会）
        if ((params.privacyLevel == PrivacyLevel.Encrypted || params.privacyLevel == PrivacyLevel.FullPrivacy) && params.useThresholdDecryption) {
            voting.useThresholdDecryption = true;
            voting.thresholdT = params.thresholdT;
            for (uint256 i = 0; i < params.thresholdCommittee.length; i++) {
                if (params.thresholdCommittee[i] == address(0)) revert InvalidAddress();
                voting.thresholdCommittee.push(params.thresholdCommittee[i]);
            }
        }

        // NFT/Token 持有者模式：存储合约地址、最低持有量、快照区块
        if (params.registrationRule == RegistrationRule.NFTHolder || params.registrationRule == RegistrationRule.TokenHolder) {
            require(params.tokenContractAddress != address(0), "Token contract address required");
            require(params.tokenMinBalance > 0, "Min balance must be > 0");
            voting.tokenContractAddress = params.tokenContractAddress;
            voting.tokenMinBalance = params.tokenMinBalance;
            if (params.snapshotBlockNumber > 0) {
                require(params.snapshotBlockNumber <= block.number, "Snapshot block must be in past");
                voting.snapshotBlockNumber = params.snapshotBlockNumber;
            }
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
        // 加密投票或完全隐私：委托 EncryptedVoting 初始化（完全隐私计票时用 submitTallyResult）
        if (params.privacyLevel == PrivacyLevel.Encrypted || params.privacyLevel == PrivacyLevel.FullPrivacy) {
            IEncryptedVoting(encryptedVoting).initializeEncryptedVoting(votingId);
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

        // 执行机制：若模式为 OnChainAuto/MultiSig/Timelock 且配置了目标，则注册
        if (
            params.executionMode != IVotingTypes.ExecutionMode.None &&
            params.executionTarget != address(0) &&
            address(executionCenter) != address(0) &&
            (params.executionCalldata.length > 0 || params.executionValue > 0)
        ) {
            require(
                params.executionOnWinningOption < params.options.length,
                "executeOnWinningOption out of range"
            );
            if (params.executionMode == IVotingTypes.ExecutionMode.MultiSig) {
                require(params.executionMultisig != address(0), "MultiSig requires multisig address");
            }
            if (params.executionMode == IVotingTypes.ExecutionMode.Timelock) {
                require(params.executionTimelockDelay > 0, "Timelock requires delay > 0");
            }
            executionCenter.setExecutionConfig(
                votingId,
                params.executionMode,
                params.executionTarget,
                params.executionValue,
                params.executionCalldata,
                params.executionOnWinningOption,
                params.executionMultisig,
                params.executionTimelockDelay,
                msg.sender
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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
        
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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
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

        // NFT/Token 持有者模式：按快照余额验证资格，并按快照余额作为投票权重（1 token/NFT = 1 票）
        if (voting.registrationRule == RegistrationRule.NFTHolder || voting.registrationRule == RegistrationRule.TokenHolder) {
            uint256 balance = _getSnapshotBalance(voting, msg.sender);
            require(balance >= voting.tokenMinBalance, "Insufficient token balance at snapshot");
            require(
                registrationCenter.registerVoterWithWeight(votingId, msg.sender, balance, 0),
                "Registration failed"
            );
        } else {
            // 直接注册（开放模式）
            require(
                registrationCenter.registerVoter(votingId, msg.sender),
                "Registration failed"
            );
        }

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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
        
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

        // NFT/Token 持有者模式：按快照余额验证资格，权重取「快照余额」与「分组权重」的较小值（或仅用快照余额，见下）
        // 为统一快照语义：Token/NFT 模式下投票权=快照余额，忽略分组权重
        if (voting.registrationRule == RegistrationRule.NFTHolder || voting.registrationRule == RegistrationRule.TokenHolder) {
            uint256 balance = _getSnapshotBalance(voting, msg.sender);
            require(balance >= voting.tokenMinBalance, "Insufficient token balance at snapshot");
            require(
                registrationCenter.registerVoterWithWeight(votingId, msg.sender, balance, groupIndex),
                "Registration failed"
            );
        } else {
            require(
                registrationCenter.registerVoterWithWeight(votingId, msg.sender, weight, groupIndex),
                "Registration failed"
            );
        }

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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
        
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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
        require(
            voting.privacyLevel != PrivacyLevel.Anonymous && voting.privacyLevel != PrivacyLevel.FullPrivacy,
            "Use castVoteAnonymous for anonymous voting"
        );
        require(
            voting.privacyLevel != PrivacyLevel.Encrypted,
            "Use castVoteEncrypted for encrypted voting"
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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];

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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];

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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
        
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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
        
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
        if (voting.votingRule == VotingRule.RankedChoice && voting.privacyLevel != PrivacyLevel.Encrypted) {
            // 排序选择（非加密）：使用 IRV 多轮淘汰算法计算最终票数
            voteCounts = votingCenter.computeRankedResult(votingId);
            votingCenter.writeRankedResultCounts(votingId, voteCounts);
        } else {
            // 公开/匿名/加密：直接取已聚合的票数（加密排序选择由 submitTallyResult 已写入 IRV 最终结果）
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

        // Timelock 模式：揭示后调度延迟执行
        if (address(executionCenter) != address(0)) {
            executionCenter.scheduleTimelockIfNeeded(votingId);
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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
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
        VotingDataTypes.VotingInfo storage voting = votings[votingId];
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
        returns (VotingDataTypes.VotingInfo memory) 
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
        if (
            address(registrationCenter) != address(0) &&
            address(votingCenter) != address(0) &&
            address(revealCenter) != address(0) &&
            address(statisticsCenter) != address(0)
        ) {
            centersConfigured = true;
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

    /**
     * @notice 获取执行中心合约地址（可选，未配置时返回 address(0)）
     */
    function getExecutionCenterAddress() external view returns (address) {
        return address(executionCenter);
    }
}
