// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IVotingTypes.sol";
import "./RegistrationCenter.sol";
import "./VotingCenter.sol";

/// @notice VotingFactory 的 VotingInfo 结构（与合约内定义一致）
struct EncryptedVotingInfo {
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
    uint256 snapshotBlockNumber;  // 与 VotingInfo 布局一致
    bool useThresholdDecryption;   // 是否使用阈值解密（t-of-n 委员会确认）
    uint8 thresholdT;             // 阈值 t
    address[] thresholdCommittee; // 委员会成员
    uint256 revealDelay;          // 结果揭示延迟（区块或秒，0=不延迟）
}

interface IEncryptedVotingFactory {
    function getVotingRaw(uint256 votingId) external view returns (EncryptedVotingInfo memory);
    function canVote(uint256 votingId) external view returns (bool);
    function emitEncryptedVoteCast(uint256 votingId, bytes32 ballotHash) external;
    function owner() external view returns (address);
}

interface IEncryptedStatisticsCenter {
    function recordVoteCast(uint256 votingId, address voter) external;
}

/**
 * @title EncryptedVoting
 * @notice 加密投票模块 - 管理同态加密选票的提交与计票结果写入
 * @dev 选民在 Factory 正常注册，投票阶段向本合约提交加密选票；计票阶段由创建者提交解密后的票数
 */
contract EncryptedVoting is IVotingTypes {

    /// @notice 加密选票提交事件（仅含选票哈希，不暴露内容）
    event EncryptedBallotCast(uint256 indexed votingId, address indexed voter, bytes32 ballotHash);

    /// @notice 投票工厂合约
    address public votingFactory;

    /// @notice 注册中心
    RegistrationCenter public registrationCenter;

    /// @notice 计票中心
    VotingCenter public votingCenter;

    /// @notice 统计中心（可选）
    address public statisticsCenter;

    /// @notice 阈值解密：待确认的计票结果（votingId => 提交者，address(0) 表示无待处理）
    mapping(uint256 => address) public pendingTallySubmittedBy;
    /// @notice 待确认的加密选票总数
    mapping(uint256 => uint256) public pendingTotalBallots;
    /// @notice 待确认的各选项票数（votingId => optionIndex => count）
    mapping(uint256 => mapping(uint256 => uint256)) public pendingDecryptedCounts;
    /// @notice 委员会成员对该投票的确认数
    mapping(uint256 => uint256) public pendingApprovalCount;
    /// @notice 委员会成员是否已确认（votingId => member => bool）
    mapping(uint256 => mapping(address => bool)) public pendingApproved;

    modifier onlyVotingFactory() {
        require(msg.sender == votingFactory, "Only VotingFactory");
        _;
    }

    constructor(
        address _votingFactory,
        address _registrationCenter,
        address _votingCenter,
        address _statisticsCenter
    ) {
        require(_votingFactory != address(0), "Invalid votingFactory");
        require(_registrationCenter != address(0), "Invalid registrationCenter");
        require(_votingCenter != address(0), "Invalid votingCenter");
        votingFactory = _votingFactory;
        registrationCenter = RegistrationCenter(_registrationCenter);
        votingCenter = VotingCenter(_votingCenter);
        statisticsCenter = _statisticsCenter;
    }

    /**
     * @notice 初始化加密投票（占位，与 AnonymousVoting.createGroups 对称，加密投票无需链上群组）
     */
    function initializeEncryptedVoting(uint256 /* votingId */) external onlyVotingFactory {
        // no-op: 加密投票不需要链上群组或密钥初始化，仅占位供 Factory 统一调用
    }

    /**
     * @notice 提交加密选票
     * @param votingId 投票ID
     * @param encryptedBallot 加密后的选票（同态加密密文，由前端/客户端生成）
     */
    function castVoteEncrypted(uint256 votingId, bytes calldata encryptedBallot) external {
        EncryptedVotingInfo memory voting = _getVoting(votingId);
        require(
            voting.privacyLevel == IVotingTypes.PrivacyLevel.Encrypted ||
            voting.privacyLevel == IVotingTypes.PrivacyLevel.FullPrivacy,
            "Not encrypted voting"
        );
        require(
            voting.votingRule == IVotingTypes.VotingRule.SimpleMajority ||
            voting.votingRule == IVotingTypes.VotingRule.Weighted ||
            voting.votingRule == IVotingTypes.VotingRule.RankedChoice ||
            voting.votingRule == IVotingTypes.VotingRule.Quadratic,
            "Unsupported voting rule for encrypted"
        );
        _requireCanVote(votingId, voting);
        require(registrationCenter.isEligibleVoter(votingId, msg.sender), "Not registered");
        require(encryptedBallot.length > 0, "Empty ballot");

        bytes32 ballotHash = keccak256(encryptedBallot);
        votingCenter.markEncryptedVoterVoted(votingId, msg.sender);

        if (statisticsCenter != address(0)) {
            IEncryptedStatisticsCenter(statisticsCenter).recordVoteCast(votingId, msg.sender);
        }
        IEncryptedVotingFactory(votingFactory).emitEncryptedVoteCast(votingId, ballotHash);
        emit EncryptedBallotCast(votingId, msg.sender, ballotHash);
    }

    /**
     * @notice 提交解密后的计票结果。若启用阈值解密，则存入待确认，需 t 名委员会成员调用 approveTallyResult 后生效；否则仅创建者/owner 可提交并立即生效。
     * @param votingId 投票ID
     * @param totalBallots 加密选票总数（应与实际提交的选票数一致）
     * @param decryptedCounts 各选项的解密票数
     */
    function submitTallyResult(
        uint256 votingId,
        uint256 totalBallots,
        uint256[] calldata decryptedCounts
    ) external {
        EncryptedVotingInfo memory voting = _getVoting(votingId);
        require(
            voting.privacyLevel == IVotingTypes.PrivacyLevel.Encrypted ||
            voting.privacyLevel == IVotingTypes.PrivacyLevel.FullPrivacy,
            "Not encrypted voting"
        );
        require(
            _getEffectiveState(votingId) == IVotingTypes.VotingState.Tallying,
            "Must be in Tallying state"
        );
        require(decryptedCounts.length == voting.options.length, "Counts length mismatch");

        if (voting.useThresholdDecryption) {
            require(
                msg.sender == voting.creator ||
                msg.sender == IEncryptedVotingFactory(votingFactory).owner() ||
                _isCommitteeMember(voting, msg.sender),
                "Only creator, owner or committee"
            );
            require(pendingTallySubmittedBy[votingId] == address(0), "Pending tally already exists");
            pendingTallySubmittedBy[votingId] = msg.sender;
            pendingTotalBallots[votingId] = totalBallots;
            for (uint256 i = 0; i < decryptedCounts.length; i++) {
                pendingDecryptedCounts[votingId][i] = decryptedCounts[i];
            }
            pendingApprovalCount[votingId] = 0;
        } else {
            require(
                msg.sender == voting.creator || msg.sender == IEncryptedVotingFactory(votingFactory).owner(),
                "Only creator or factory owner"
            );
            votingCenter.setTallyResultEncrypted(votingId, totalBallots, decryptedCounts);
        }
    }

    /**
     * @notice 委员会成员确认计票结果（阈值解密时）。达到 t 人确认后，计票结果写入并生效。
     * @param votingId 投票ID
     */
    function approveTallyResult(uint256 votingId) external {
        require(pendingTallySubmittedBy[votingId] != address(0), "No pending tally");
        EncryptedVotingInfo memory voting = _getVoting(votingId);
        require(voting.useThresholdDecryption, "Not threshold decryption");
        require(_isCommitteeMember(voting, msg.sender), "Not committee member");
        require(!pendingApproved[votingId][msg.sender], "Already approved");
        pendingApproved[votingId][msg.sender] = true;
        pendingApprovalCount[votingId]++;

        if (pendingApprovalCount[votingId] >= voting.thresholdT) {
            uint256 optionCount = voting.options.length;
            uint256[] memory decryptedCounts = new uint256[](optionCount);
            for (uint256 i = 0; i < optionCount; i++) {
                decryptedCounts[i] = pendingDecryptedCounts[votingId][i];
            }
            votingCenter.setTallyResultEncrypted(votingId, pendingTotalBallots[votingId], decryptedCounts);
            pendingTallySubmittedBy[votingId] = address(0);
        }
    }

    function _isCommitteeMember(EncryptedVotingInfo memory voting, address account) internal pure returns (bool) {
        for (uint256 i = 0; i < voting.thresholdCommittee.length; i++) {
            if (voting.thresholdCommittee[i] == account) return true;
        }
        return false;
    }

    function _getVoting(uint256 votingId) internal view returns (EncryptedVotingInfo memory) {
        return IEncryptedVotingFactory(votingFactory).getVotingRaw(votingId);
    }

    function _getEffectiveState(uint256 votingId) internal view returns (IVotingTypes.VotingState) {
        EncryptedVotingInfo memory voting = _getVoting(votingId);
        if (voting.state == IVotingTypes.VotingState.Cancelled) return IVotingTypes.VotingState.Cancelled;
        if (!voting.autoAdvance) return voting.state;
        if (voting.state == IVotingTypes.VotingState.Finalized) return IVotingTypes.VotingState.Finalized;
        uint256 nowOrBlock = voting.useBlockNumber ? block.number : block.timestamp;
        if (nowOrBlock > voting.votingEnd) return IVotingTypes.VotingState.Tallying;
        if (nowOrBlock >= voting.votingStart) return IVotingTypes.VotingState.Voting;
        if (nowOrBlock >= voting.registrationStart) return IVotingTypes.VotingState.Registration;
        return IVotingTypes.VotingState.Created;
    }

    function _requireCanVote(uint256 votingId, EncryptedVotingInfo memory voting) internal view {
        if (voting.autoAdvance) {
            require(IEncryptedVotingFactory(votingFactory).canVote(votingId), "Voting not open");
        } else {
            require(voting.state == IVotingTypes.VotingState.Voting, "Invalid state");
        }
    }
}
