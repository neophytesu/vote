// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IVotingTypes.sol";
import "./RegistrationCenter.sol";
import "./VotingCenter.sol";
import "./RevealCenter.sol";

/**
 * @title VotingCore
 * @notice 主投票合约 - 协调注册中心、计票中心、揭示中心
 * @dev 管理投票的完整生命周期，对应文档中的状态机
 * 
 * 状态机流程:
 * Created -> Registration -> Voting -> Tallying -> Finalized
 */
contract VotingCore is IVotingTypes {
    
    /// @notice 提案创建事件
    event ProposalCreated(
        uint256 indexed proposalId, 
        address indexed creator, 
        string title
    );
    
    /// @notice 状态变更事件
    event StateChanged(
        uint256 indexed proposalId, 
        VotingState oldState, 
        VotingState newState
    );
    
    /// @notice 选民注册事件
    event VoterRegistered(uint256 indexed proposalId, address indexed voter);
    
    /// @notice 投票事件
    event VoteCast(uint256 indexed proposalId, address indexed voter, uint256 optionIndex);
    
    /// @notice 结果揭示事件
    event ResultFinalized(uint256 indexed proposalId, uint256 winningOption, bool passed);

    /// @notice 注册中心
    RegistrationCenter public registrationCenter;
    
    /// @notice 计票中心
    VotingCenter public votingCenter;
    
    /// @notice 揭示中心
    RevealCenter public revealCenter;

    /// @notice 提案计数器
    uint256 public proposalCount;

    /// @notice 提案ID => 提案信息
    mapping(uint256 => Proposal) public proposals;
    
    /// @notice 提案ID => 选项列表
    mapping(uint256 => string[]) public proposalOptions;

    /// @notice 合约所有者
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call");
        _;
    }

    modifier proposalExists(uint256 proposalId) {
        require(proposalId > 0 && proposalId <= proposalCount, "Proposal does not exist");
        _;
    }

    modifier inState(uint256 proposalId, VotingState state) {
        require(proposals[proposalId].state == state, "Invalid state for this action");
        _;
    }

    constructor(
        address _registrationCenter,
        address _votingCenter,
        address _revealCenter
    ) {
        owner = msg.sender;
        
        registrationCenter = RegistrationCenter(_registrationCenter);
        votingCenter = VotingCenter(_votingCenter);
        revealCenter = RevealCenter(_revealCenter);
    }

    /**
     * @notice 创建新提案 - Step 1: Created
     * @param config 提案配置
     * @return proposalId 新提案ID
     */
    function createProposal(
        ProposalConfig calldata config
    ) external returns (uint256 proposalId) {
        require(bytes(config.title).length > 0, "Title required");
        require(config.options.length >= 2, "At least 2 options required");
        require(config.registrationEnd > config.registrationStart, "Invalid registration period");
        require(config.votingEnd > config.votingStart, "Invalid voting period");
        require(config.votingStart >= config.registrationEnd, "Voting must start after registration ends");

        proposalCount++;
        proposalId = proposalCount;

        // 存储提案
        proposals[proposalId] = Proposal({
            id: proposalId,
            creator: msg.sender,
            config: config,
            state: VotingState.Created,
            totalVoters: 0,
            totalVotes: 0,
            resultRevealed: false
        });

        // 存储选项
        for (uint256 i = 0; i < config.options.length; i++) {
            proposalOptions[proposalId].push(config.options[i]);
        }

        // 初始化计票中心
        votingCenter.initializeProposal(proposalId, config.options.length);

        emit ProposalCreated(proposalId, msg.sender, config.title);
        
        return proposalId;
    }

    /**
     * @notice 开始注册阶段 - Step 1 -> Step 2
     * @param proposalId 提案ID
     */
    function startRegistration(uint256 proposalId) 
        external 
        proposalExists(proposalId)
        inState(proposalId, VotingState.Created)
    {
        Proposal storage proposal = proposals[proposalId];
        require(
            msg.sender == proposal.creator || msg.sender == owner,
            "Only creator or owner can start registration"
        );
        require(
            block.timestamp >= proposal.config.registrationStart,
            "Registration period not started"
        );

        _changeState(proposalId, VotingState.Registration);
    }

    /**
     * @notice 注册选民 - Step 2: Registration
     * @param proposalId 提案ID
     */
    function registerVoter(uint256 proposalId)
        external
        proposalExists(proposalId)
        inState(proposalId, VotingState.Registration)
    {
        Proposal storage proposal = proposals[proposalId];
        require(
            block.timestamp <= proposal.config.registrationEnd,
            "Registration period ended"
        );

        // 调用注册中心
        bool success = registrationCenter.registerVoter(proposalId, msg.sender);
        require(success, "Registration failed");

        proposal.totalVoters++;
        
        emit VoterRegistered(proposalId, msg.sender);
    }

    /**
     * @notice 开始投票阶段 - Step 2 -> Step 3
     * @param proposalId 提案ID
     */
    function startVoting(uint256 proposalId)
        external
        proposalExists(proposalId)
        inState(proposalId, VotingState.Registration)
    {
        Proposal storage proposal = proposals[proposalId];
        require(
            block.timestamp >= proposal.config.votingStart,
            "Voting period not started"
        );

        _changeState(proposalId, VotingState.Voting);
    }

    /**
     * @notice 投票 - Step 3: Voting
     * @param proposalId 提案ID
     * @param optionIndex 选项索引
     */
    function castVote(uint256 proposalId, uint256 optionIndex)
        external
        proposalExists(proposalId)
        inState(proposalId, VotingState.Voting)
    {
        Proposal storage proposal = proposals[proposalId];
        require(
            block.timestamp <= proposal.config.votingEnd,
            "Voting period ended"
        );
        require(
            registrationCenter.isEligibleVoter(proposalId, msg.sender),
            "Not a registered voter"
        );

        // 调用计票中心（VotingCore 使用默认权重1）
        bool success = votingCenter.castVote(proposalId, msg.sender, optionIndex, 1);
        require(success, "Vote failed");

        proposal.totalVotes++;
        
        emit VoteCast(proposalId, msg.sender, optionIndex);
    }

    /**
     * @notice 开始计票阶段 - Step 3 -> Step 4
     * @param proposalId 提案ID
     */
    function startTallying(uint256 proposalId)
        external
        proposalExists(proposalId)
        inState(proposalId, VotingState.Voting)
    {
        Proposal storage proposal = proposals[proposalId];
        require(
            block.timestamp > proposal.config.votingEnd,
            "Voting period not ended yet"
        );

        _changeState(proposalId, VotingState.Tallying);
    }

    /**
     * @notice 揭示结果 - Step 4 -> Step 5
     * @param proposalId 提案ID
     */
    function revealResult(uint256 proposalId)
        external
        proposalExists(proposalId)
        inState(proposalId, VotingState.Tallying)
    {
        Proposal storage proposal = proposals[proposalId];

        // 获取投票结果
        uint256[] memory voteCounts = votingCenter.getAllVoteCounts(proposalId);
        uint256 totalVoters = registrationCenter.getVoterCount(proposalId);

        // 调用揭示中心
        RevealCenter.VotingResult memory result = revealCenter.revealResult(
            proposalId,
            voteCounts,
            totalVoters,
            proposal.config.quorum
        );

        proposal.resultRevealed = true;
        
        _changeState(proposalId, VotingState.Finalized);

        emit ResultFinalized(proposalId, result.winningOption, result.passed);
    }

    /**
     * @notice 内部状态变更函数
     */
    function _changeState(uint256 proposalId, VotingState newState) internal {
        VotingState oldState = proposals[proposalId].state;
        proposals[proposalId].state = newState;
        emit StateChanged(proposalId, oldState, newState);
    }

    // ==================== 查询函数 ====================

    /**
     * @notice 获取提案信息
     */
    function getProposal(uint256 proposalId) 
        external 
        view 
        proposalExists(proposalId)
        returns (Proposal memory) 
    {
        return proposals[proposalId];
    }

    /**
     * @notice 获取提案选项
     */
    function getProposalOptions(uint256 proposalId)
        external
        view
        proposalExists(proposalId)
        returns (string[] memory)
    {
        return proposalOptions[proposalId];
    }

    /**
     * @notice 获取提案当前状态
     */
    function getProposalState(uint256 proposalId)
        external
        view
        proposalExists(proposalId)
        returns (VotingState)
    {
        return proposals[proposalId].state;
    }

    /**
     * @notice 检查用户是否已注册
     */
    function isVoterRegistered(uint256 proposalId, address voter)
        external
        view
        returns (bool)
    {
        return registrationCenter.isEligibleVoter(proposalId, voter);
    }

    /**
     * @notice 检查用户是否已投票
     */
    function hasVoted(uint256 proposalId, address voter)
        external
        view
        returns (bool)
    {
        return votingCenter.hasVoterVoted(proposalId, voter);
    }

    /**
     * @notice 获取投票结果
     */
    function getVotingResult(uint256 proposalId)
        external
        view
        proposalExists(proposalId)
        returns (RevealCenter.VotingResult memory)
    {
        return revealCenter.getResult(proposalId);
    }

    /**
     * @notice 获取当前票数（仅在揭示后可用）
     */
    function getVoteCounts(uint256 proposalId)
        external
        view
        proposalExists(proposalId)
        returns (uint256[] memory)
    {
        require(
            proposals[proposalId].state == VotingState.Finalized,
            "Result not revealed yet"
        );
        return votingCenter.getAllVoteCounts(proposalId);
    }
}

