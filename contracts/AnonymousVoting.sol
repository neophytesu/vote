// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IVotingTypes.sol";
import "./interfaces/ISemaphoreVoting.sol";
import "./RegistrationCenter.sol";
import "./VotingCenter.sol";

/// @notice VotingFactory 的 VotingInfo 结构（与合约内定义一致）
struct VotingInfo {
    uint256 id;
    address creator;
    string title;
    string description;
    string[] options;
    IVotingTypes.VotingRule votingRule;
    IVotingTypes.PrivacyLevel privacyLevel;
    IVotingTypes.VotingState state;
    uint256 registrationStart;
    uint256 registrationEnd;
    uint256 votingStart;
    uint256 votingEnd;
    uint256 quorum;
    uint256 createdAt;
    bool autoAdvance;
    uint16 visibilityBitmap;
    string[] weightGroupNames;
    uint256[] weightGroupWeights;
    IVotingTypes.RegistrationRule registrationRule;
    address tokenContractAddress;
    uint256 tokenMinBalance;
    bool useBlockNumber;
    bool allowExtension;
}

interface IAnonymousVotingFactory {
    function getVotingRaw(uint256 votingId) external view returns (VotingInfo memory);
    function canRegister(uint256 votingId) external view returns (bool);
    function canVote(uint256 votingId) external view returns (bool);
    function recordVoterParticipation(address voter, uint256 votingId) external;
    function emitVoterRegistered(uint256 votingId, address voter) external;
    function emitAnonymousVoteCast(uint256 votingId, uint256 optionIndex, uint256 nullifierHash) external;
}

interface IAnonymousStatisticsCenter {
    function recordVoterRegistered(uint256 votingId, address voter) external;
    function recordVoteCast(uint256 votingId, address voter) external;
}

/**
 * @title AnonymousVoting
 * @notice 匿名投票模块 - 从 VotingFactory 拆分，管理 Semaphore 群组及匿名注册/投票
 * @dev 解决 VotingFactory 超过 EVM 24KB 限制的部署问题
 */
contract AnonymousVoting is IVotingTypes {

    /// @notice 匿名投票事件（不包含 voter 地址）
    event AnonymousVoteCast(uint256 indexed votingId, uint256 optionIndex, uint256 nullifierHash);

    /// @notice 投票工厂合约（查询投票信息、状态、记录参与）
    address public votingFactory;

    /// @notice Semaphore 合约
    ISemaphoreVoting public semaphore;

    /// @notice 注册中心
    RegistrationCenter public registrationCenter;

    /// @notice 计票中心
    VotingCenter public votingCenter;

    /// @notice 统计中心（可选）
    address public statisticsCenter;

    /// @notice 投票ID => Semaphore 群组ID（Anonymous 简单多数/排序选择/二次方用）
    /// @dev Semaphore 首个群组 ID 为 0，故不能以 groupId!=0 判断群组是否存在
    mapping(uint256 => uint256) public votingSemaphoreGroupId;

    /// @notice 投票ID => 是否已创建 Semaphore 群组（群组 ID 0 有效，需单独标记）
    mapping(uint256 => bool) private _votingHasSemaphoreGroup;

    /// @notice 投票ID => 权重分组索引 => Semaphore 群组ID（Anonymous 加权用）
    mapping(uint256 => mapping(uint256 => uint256)) public votingSemaphoreGroupIdByWeight;

    /// @notice 投票ID => 权重分组索引 => 是否已创建
    mapping(uint256 => mapping(uint256 => bool)) private _votingWeightGroupCreated;

    modifier onlyVotingFactory() {
        require(msg.sender == votingFactory, "Only VotingFactory");
        _;
    }

    /// @notice 检查投票是否已创建 Semaphore 群组（用于测试/前端）
    function hasSemaphoreGroup(uint256 votingId) external view returns (bool) {
        return _votingHasSemaphoreGroup[votingId];
    }

    constructor(
        address _votingFactory,
        address _semaphore,
        address _registrationCenter,
        address _votingCenter,
        address _statisticsCenter
    ) {
        require(_votingFactory != address(0), "Invalid votingFactory");
        require(_semaphore != address(0), "Invalid semaphore");
        require(_registrationCenter != address(0), "Invalid registrationCenter");
        require(_votingCenter != address(0), "Invalid votingCenter");
        votingFactory = _votingFactory;
        semaphore = ISemaphoreVoting(_semaphore);
        registrationCenter = RegistrationCenter(_registrationCenter);
        votingCenter = VotingCenter(_votingCenter);
        statisticsCenter = _statisticsCenter;
    }

    /**
     * @notice 创建匿名投票对应的 Semaphore 群组（由 VotingFactory 在 createVoting 时调用）
     * @param votingId 投票ID
     * @param votingRule 投票规则
     * @param weightGroupCount 权重分组数量（仅 Weighted 时使用）
     */
    function createGroups(
        uint256 votingId,
        IVotingTypes.VotingRule votingRule,
        uint256 weightGroupCount
    ) external onlyVotingFactory {
        if (votingRule == IVotingTypes.VotingRule.Weighted) {
            for (uint256 i = 0; i < weightGroupCount; i++) {
                uint256 gid = semaphore.createGroup(address(this));
                votingSemaphoreGroupIdByWeight[votingId][i] = gid;
                _votingWeightGroupCreated[votingId][i] = true;
            }
        } else {
            uint256 groupId = semaphore.createGroup(address(this));
            votingSemaphoreGroupId[votingId] = groupId;
            _votingHasSemaphoreGroup[votingId] = true;
        }
    }

    /**
     * @notice 匿名投票 - 注册选民（简单多数/排序选择/二次方，提交 Semaphore 身份承诺）
     */
    function registerVoterAnonymous(uint256 votingId, uint256 identityCommitment)
        external
    {
        VotingInfo memory voting = _getVoting(votingId);
        require(
            voting.privacyLevel == IVotingTypes.PrivacyLevel.Anonymous || voting.privacyLevel == IVotingTypes.PrivacyLevel.FullPrivacy,
            "Not anonymous voting"
        );
        require(
            voting.votingRule == IVotingTypes.VotingRule.SimpleMajority ||
            voting.votingRule == IVotingTypes.VotingRule.RankedChoice ||
            voting.votingRule == IVotingTypes.VotingRule.Quadratic,
            "Use registerVoterAnonymousWeighted for weighted"
        );
        require(_votingHasSemaphoreGroup[votingId], "No Semaphore group");
        uint256 groupId = votingSemaphoreGroupId[votingId];

        _requireCanRegister(votingId, voting);
        require(!registrationCenter.isEligibleVoter(votingId, msg.sender), "Already registered");

        semaphore.addMember(groupId, identityCommitment);
        require(registrationCenter.registerVoter(votingId, msg.sender), "Registration failed");

        _recordVoterParticipation(msg.sender, votingId);
        if (statisticsCenter != address(0)) {
            IAnonymousStatisticsCenter(statisticsCenter).recordVoterRegistered(votingId, msg.sender);
        }
        _emitVoterRegistered(votingId, msg.sender);
    }

    /**
     * @notice 匿名加权投票 - 注册选民（提交身份承诺 + 选择权重分组）
     */
    function registerVoterAnonymousWeighted(uint256 votingId, uint256 identityCommitment, uint256 groupIndex)
        external
    {
        VotingInfo memory voting = _getVoting(votingId);
        require(
            voting.privacyLevel == IVotingTypes.PrivacyLevel.Anonymous || voting.privacyLevel == IVotingTypes.PrivacyLevel.FullPrivacy,
            "Not anonymous voting"
        );
        require(voting.votingRule == IVotingTypes.VotingRule.Weighted, "Not weighted voting");
        require(groupIndex < voting.weightGroupWeights.length, "Invalid group index");
        require(_votingWeightGroupCreated[votingId][groupIndex], "No Semaphore group for this weight tier");
        uint256 groupId = votingSemaphoreGroupIdByWeight[votingId][groupIndex];

        _requireCanRegister(votingId, voting);
        require(!registrationCenter.isEligibleVoter(votingId, msg.sender), "Already registered");

        uint256 weight = voting.weightGroupWeights[groupIndex];
        semaphore.addMember(groupId, identityCommitment);
        require(registrationCenter.registerVoterWithWeight(votingId, msg.sender, weight, groupIndex), "Registration failed");

        _recordVoterParticipation(msg.sender, votingId);
        if (statisticsCenter != address(0)) {
            IAnonymousStatisticsCenter(statisticsCenter).recordVoterRegistered(votingId, msg.sender);
        }
        _emitVoterRegistered(votingId, msg.sender);
    }

    /**
     * @notice 匿名投票 - 提交 ZK 证明（简单多数）
     */
    function castVoteAnonymous(
        uint256 votingId,
        uint256 optionIndex,
        ISemaphoreVoting.SemaphoreProof calldata proof
    ) external {
        VotingInfo memory voting = _getVoting(votingId);
        require(
            voting.privacyLevel == IVotingTypes.PrivacyLevel.Anonymous || voting.privacyLevel == IVotingTypes.PrivacyLevel.FullPrivacy,
            "Not anonymous voting"
        );
        require(voting.votingRule == IVotingTypes.VotingRule.SimpleMajority, "Anonymous voting is simple majority only");

        _requireCanVote(votingId, voting);
        require(proof.message == optionIndex, "Proof message mismatch");
        require(optionIndex < voting.options.length, "Invalid option index");
        require(_votingHasSemaphoreGroup[votingId], "No Semaphore group");
        uint256 groupId = votingSemaphoreGroupId[votingId];

        semaphore.validateProof(groupId, proof);

        bool success = votingCenter.castVoteAnonymous(votingId, optionIndex);
        require(success, "Vote failed");

        if (statisticsCenter != address(0)) {
            IAnonymousStatisticsCenter(statisticsCenter).recordVoteCast(votingId, msg.sender);
        }
        _emitAnonymousVoteCast(votingId, optionIndex, proof.nullifier);
    }

    /**
     * @notice 匿名加权投票 - 提交 ZK 证明
     */
    function castVoteAnonymousWeighted(
        uint256 votingId,
        uint256 optionIndex,
        uint256 groupIndex,
        ISemaphoreVoting.SemaphoreProof calldata proof
    ) external {
        VotingInfo memory voting = _getVoting(votingId);
        require(
            voting.privacyLevel == IVotingTypes.PrivacyLevel.Anonymous || voting.privacyLevel == IVotingTypes.PrivacyLevel.FullPrivacy,
            "Not anonymous voting"
        );
        require(voting.votingRule == IVotingTypes.VotingRule.Weighted, "Not weighted voting");

        _requireCanVote(votingId, voting);
        require(proof.message == optionIndex, "Proof message mismatch");
        require(optionIndex < voting.options.length, "Invalid option index");
        require(groupIndex < voting.weightGroupWeights.length, "Invalid group index");
        require(_votingWeightGroupCreated[votingId][groupIndex], "No Semaphore group");
        uint256 groupId = votingSemaphoreGroupIdByWeight[votingId][groupIndex];

        semaphore.validateProof(groupId, proof);

        uint256 weight = voting.weightGroupWeights[groupIndex];
        bool success = votingCenter.castVoteAnonymousWeighted(votingId, optionIndex, weight);
        require(success, "Vote failed");

        if (statisticsCenter != address(0)) {
            IAnonymousStatisticsCenter(statisticsCenter).recordVoteCast(votingId, msg.sender);
        }
        _emitAnonymousVoteCast(votingId, optionIndex, proof.nullifier);
    }

    /**
     * @notice 匿名排序选择投票 - 提交 ZK 证明（message 为编码后的排名）
     */
    function castVoteAnonymousRanked(
        uint256 votingId,
        uint256 encodedRanking,
        ISemaphoreVoting.SemaphoreProof calldata proof
    ) external {
        VotingInfo memory voting = _getVoting(votingId);
        require(
            voting.privacyLevel == IVotingTypes.PrivacyLevel.Anonymous || voting.privacyLevel == IVotingTypes.PrivacyLevel.FullPrivacy,
            "Not anonymous voting"
        );
        require(voting.votingRule == IVotingTypes.VotingRule.RankedChoice, "Not ranked choice");

        _requireCanVote(votingId, voting);
        require(proof.message == encodedRanking, "Proof message mismatch");
        require(_votingHasSemaphoreGroup[votingId], "No Semaphore group");
        uint256 groupId = votingSemaphoreGroupId[votingId];

        semaphore.validateProof(groupId, proof);

        uint256 n = voting.options.length;
        uint256[] memory rankedOptions = new uint256[](n);
        uint256 enc = encodedRanking;
        for (uint256 i = 0; i < n; i++) {
            rankedOptions[i] = enc % n;
            enc = enc / n;
        }
        bool[] memory seen = new bool[](n);
        for (uint256 i = 0; i < n; i++) {
            require(rankedOptions[i] < n, "Invalid option in ranking");
            require(!seen[rankedOptions[i]], "Duplicate in ranking");
            seen[rankedOptions[i]] = true;
        }

        bool success = votingCenter.castRankedVoteAnonymous(votingId, rankedOptions);
        require(success, "Vote failed");

        if (statisticsCenter != address(0)) {
            IAnonymousStatisticsCenter(statisticsCenter).recordVoteCast(votingId, msg.sender);
        }
        _emitAnonymousVoteCast(votingId, rankedOptions[0], proof.nullifier);
    }

    /**
     * @notice 匿名二次方投票 - 提交 ZK 证明（message 为编码后的票数分配）
     */
    function castVoteAnonymousQuadratic(
        uint256 votingId,
        uint256 encodedVote,
        ISemaphoreVoting.SemaphoreProof calldata proof
    ) external {
        VotingInfo memory voting = _getVoting(votingId);
        require(
            voting.privacyLevel == IVotingTypes.PrivacyLevel.Anonymous || voting.privacyLevel == IVotingTypes.PrivacyLevel.FullPrivacy,
            "Not anonymous voting"
        );
        require(voting.votingRule == IVotingTypes.VotingRule.Quadratic, "Not quadratic voting");

        _requireCanVote(votingId, voting);
        require(proof.message == encodedVote, "Proof message mismatch");
        require(_votingHasSemaphoreGroup[votingId], "No Semaphore group");
        uint256 groupId = votingSemaphoreGroupId[votingId];

        semaphore.validateProof(groupId, proof);

        (uint256[] memory optionIndexes, uint256[] memory voteAmounts, uint256 firstOption) =
            _decodeQuadraticVote(encodedVote, voting.options.length);

        bool success = votingCenter.castQuadraticVoteAnonymous(votingId, optionIndexes, voteAmounts);
        require(success, "Vote failed");

        if (statisticsCenter != address(0)) {
            IAnonymousStatisticsCenter(statisticsCenter).recordVoteCast(votingId, msg.sender);
        }
        _emitAnonymousVoteCast(votingId, firstOption, proof.nullifier);
    }

    // ==================== 内部辅助 ====================

    function _getVoting(uint256 votingId) internal view returns (VotingInfo memory) {
        return IAnonymousVotingFactory(votingFactory).getVotingRaw(votingId);
    }

    function _requireCanRegister(uint256 votingId, VotingInfo memory voting) internal view {
        if (voting.autoAdvance) {
            require(IAnonymousVotingFactory(votingFactory).canRegister(votingId), "Registration not open");
        } else {
            require(voting.state == IVotingTypes.VotingState.Registration, "Invalid state");
        }
    }

    function _requireCanVote(uint256 votingId, VotingInfo memory voting) internal view {
        if (voting.autoAdvance) {
            require(IAnonymousVotingFactory(votingFactory).canVote(votingId), "Voting not open");
        } else {
            require(voting.state == IVotingTypes.VotingState.Voting, "Invalid state");
        }
    }

    function _recordVoterParticipation(address voter, uint256 votingId) internal {
        IAnonymousVotingFactory(votingFactory).recordVoterParticipation(voter, votingId);
    }

    function _emitVoterRegistered(uint256 votingId, address voter) internal {
        IAnonymousVotingFactory(votingFactory).emitVoterRegistered(votingId, voter);
    }

    function _emitAnonymousVoteCast(uint256 votingId, uint256 optionIndex, uint256 nullifierHash) internal {
        IAnonymousVotingFactory(votingFactory).emitAnonymousVoteCast(votingId, optionIndex, nullifierHash);
    }

    function _decodeQuadraticVote(uint256 encodedVote, uint256 n)
        internal
        pure
        returns (uint256[] memory optionIndexes, uint256[] memory voteAmounts, uint256 firstOption)
    {
        require(n <= 8, "Max 8 options");
        uint256[] memory v = new uint256[](n);
        uint256 totalCost = 0;
        uint256 nonZero = 0;
        bool found = false;
        for (uint256 i = 0; i < n; i++) {
            v[i] = (encodedVote >> (i * 4)) & 0xF;
            require(v[i] <= 10, "Max 10 per option");
            totalCost += v[i] * v[i];
            if (v[i] > 0) {
                nonZero++;
                if (!found) {
                    firstOption = i;
                    found = true;
                }
            }
        }
        require(totalCost <= 100, "Exceeds budget");
        require(nonZero > 0, "Must vote");

        optionIndexes = new uint256[](nonZero);
        voteAmounts = new uint256[](nonZero);
        uint256 idx = 0;
        for (uint256 i = 0; i < n; i++) {
            if (v[i] > 0) {
                optionIndexes[idx] = i;
                voteAmounts[idx] = v[i];
                idx++;
            }
        }
    }
}
