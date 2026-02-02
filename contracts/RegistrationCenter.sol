// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IVotingTypes.sol";

/**
 * @title RegistrationCenter
 * @notice 注册中心 - 管理选民注册和资格验证
 * @dev 对应文档中的 Step 2: 选民注册
 * 
 * 核心职责:
 * - 验证准入条件
 * - 存储选民身份承诺
 * - 管理Merkle树（简化版使用mapping）
 */
contract RegistrationCenter is IVotingTypes {
    
    /// @notice 注册事件
    event VoterRegistered(uint256 indexed proposalId, address indexed voter, uint256 timestamp);
    
    /// @notice 注册取消事件
    event RegistrationRevoked(uint256 indexed proposalId, address indexed voter);

    /// @notice 提案ID => 选民地址 => 是否已注册
    mapping(uint256 => mapping(address => bool)) public isRegistered;
    
    /// @notice 提案ID => 注册选民列表
    mapping(uint256 => address[]) public registeredVoters;
    
    /// @notice 提案ID => 选民数量
    mapping(uint256 => uint256) public voterCount;

    /// @notice 主投票合约地址
    address public votingCore;

    /// @notice 仅限主合约调用
    modifier onlyVotingCore() {
        require(msg.sender == votingCore, "Only VotingCore can call");
        _;
    }

    constructor() {
        // votingCore 将在部署后设置
    }

    /// @notice 设置主投票合约地址
    /// @param _votingCore 主投票合约地址
    function setVotingCore(address _votingCore) external {
        require(votingCore == address(0), "VotingCore already set");
        votingCore = _votingCore;
    }

    /**
     * @notice 注册选民
     * @param proposalId 提案ID
     * @param voter 选民地址
     * @return success 是否注册成功
     * 
     * 对应文档流程:
     * 1. 验证准入条件 (Token/NFT持有等) - 简化版只检查是否已注册
     * 2. 生成身份承诺 - 简化版使用地址作为身份
     * 3. 加入群组 - 存储到mapping
     */
    function registerVoter(
        uint256 proposalId, 
        address voter
    ) external onlyVotingCore returns (bool success) {
        require(!isRegistered[proposalId][voter], "Already registered");
        require(voter != address(0), "Invalid voter address");

        // 注册选民
        isRegistered[proposalId][voter] = true;
        registeredVoters[proposalId].push(voter);
        voterCount[proposalId]++;

        emit VoterRegistered(proposalId, voter, block.timestamp);
        
        return true;
    }

    /**
     * @notice 批量注册选民（用于白名单场景）
     * @param proposalId 提案ID
     * @param voters 选民地址列表
     */
    function batchRegisterVoters(
        uint256 proposalId,
        address[] calldata voters
    ) external onlyVotingCore {
        for (uint256 i = 0; i < voters.length; i++) {
            if (!isRegistered[proposalId][voters[i]] && voters[i] != address(0)) {
                isRegistered[proposalId][voters[i]] = true;
                registeredVoters[proposalId].push(voters[i]);
                voterCount[proposalId]++;
                emit VoterRegistered(proposalId, voters[i], block.timestamp);
            }
        }
    }

    /**
     * @notice 验证选民是否有投票资格
     * @param proposalId 提案ID
     * @param voter 选民地址
     * @return 是否有资格投票
     */
    function isEligibleVoter(
        uint256 proposalId,
        address voter
    ) external view returns (bool) {
        return isRegistered[proposalId][voter];
    }

    /**
     * @notice 获取提案的所有注册选民
     * @param proposalId 提案ID
     * @return 选民地址列表
     */
    function getRegisteredVoters(uint256 proposalId) external view returns (address[] memory) {
        return registeredVoters[proposalId];
    }

    /**
     * @notice 获取注册选民数量
     * @param proposalId 提案ID
     * @return 选民数量
     */
    function getVoterCount(uint256 proposalId) external view returns (uint256) {
        return voterCount[proposalId];
    }
}

