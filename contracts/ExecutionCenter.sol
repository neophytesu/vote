// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IVotingTypes.sol";
import "./RevealCenter.sol";

/**
 * @title ExecutionCenter
 * @notice 执行中心 - 管理提案通过后的链上执行（支持 4 种模式）
 * @dev 对应文档中的 Step 6: 执行机制
 *
 * 执行模式:
 * - None: 链下通知 - 仅 emit 事件，链下实体根据信号执行
 * - OnChainAuto: 链上自动执行 - 任何人可触发
 * - MultiSig: 多签触发 - 仅多签钱包地址可执行
 * - Timelock: 延迟执行 - 延迟期后可执行，延迟期内创建者可取消
 */
contract ExecutionCenter is IVotingTypes {

    /// @notice 执行配置
    struct ExecutionConfig {
        ExecutionMode mode;
        address target;
        uint256 value;
        bytes calldataBytes;
        uint256 executeOnWinningOption;
        address multisigAddress;      // MultiSig 模式：仅此地址可执行
        uint256 timelockDelaySeconds; // Timelock 模式：延迟秒数
        uint256 executeAfter;         // Timelock 模式：可执行时间戳
        address creator;              // 创建者（Timelock 取消用）
        bool isSet;
    }

    /// @notice 提案可执行事件（链下通知模式时，链下实体监听此事件）
    event ProposalReadyForExecution(
        uint256 indexed votingId,
        address indexed target,
        uint256 value,
        bytes calldataBytes,
        uint8 mode
    );

    /// @notice 提案执行成功事件
    event ProposalActionExecuted(
        uint256 indexed votingId,
        address indexed target,
        uint256 value,
        bool success
    );

    /// @notice Timelock 提案已取消
    event TimelockCancelled(uint256 indexed votingId, address indexed cancelledBy);

    address public votingCore;
    RevealCenter public revealCenter;

    mapping(uint256 => ExecutionConfig) public executionConfigs;
    mapping(uint256 => bool) public executed;
    mapping(uint256 => bool) public timelockCancelled;

    modifier onlyVotingCore() {
        require(msg.sender == votingCore, "Only VotingCore can call");
        _;
    }

    constructor(address _votingCore, address _revealCenter) {
        require(_votingCore != address(0), "Invalid votingCore");
        require(_revealCenter != address(0), "Invalid revealCenter");
        votingCore = _votingCore;
        revealCenter = RevealCenter(_revealCenter);
    }

    /**
     * @notice 设置执行配置（仅 VotingFactory 在 createVoting 时调用）
     */
    function setExecutionConfig(
        uint256 votingId,
        ExecutionMode mode,
        address target,
        uint256 value,
        bytes calldata calldataBytes,
        uint256 executeOnWinningOption,
        address multisigAddress,
        uint256 timelockDelaySeconds,
        address creator
    ) external onlyVotingCore {
        require(mode != ExecutionMode.None, "Use None for no execution");
        require(target != address(0), "Target cannot be zero");
        require(calldataBytes.length > 0 || value > 0, "Need calldata or value");
        require(!executionConfigs[votingId].isSet, "Config already set");

        if (mode == ExecutionMode.MultiSig) {
            require(multisigAddress != address(0), "MultiSig requires multisig address");
        }
        if (mode == ExecutionMode.Timelock) {
            require(timelockDelaySeconds > 0, "Timelock requires delay > 0");
            require(creator != address(0), "Timelock requires creator");
        }

        executionConfigs[votingId] = ExecutionConfig({
            mode: mode,
            target: target,
            value: value,
            calldataBytes: calldataBytes,
            executeOnWinningOption: executeOnWinningOption,
            multisigAddress: multisigAddress,
            timelockDelaySeconds: timelockDelaySeconds,
            executeAfter: 0, // 在 reveal 时由 VotingFactory 或此处不设，execute 时动态计算
            creator: creator,
            isSet: true
        });
    }

    /**
     * @notice 揭示完成后调度 Timelock（由 VotingFactory.revealResult 后调用）
     * @dev 若为 Timelock 模式且提案通过且胜出选项匹配，则设置 executeAfter；否则无操作
     */
    function scheduleTimelockIfNeeded(uint256 votingId) external onlyVotingCore {
        ExecutionConfig storage config = executionConfigs[votingId];
        if (!config.isSet || config.mode != ExecutionMode.Timelock || config.executeAfter > 0) {
            return;
        }
        if (!revealCenter.isResultRevealed(votingId) || !revealCenter.isProposalPassed(votingId)) {
            return;
        }
        (uint256 winningOption,) = revealCenter.getWinningOption(votingId);
        if (winningOption != config.executeOnWinningOption) {
            return;
        }
        config.executeAfter = block.timestamp + config.timelockDelaySeconds;
    }

    /**
     * @notice 取消 Timelock 执行（仅延迟期内、仅创建者可调用）
     */
    function cancelTimelock(uint256 votingId) external {
        ExecutionConfig storage config = executionConfigs[votingId];
        require(config.isSet, "No config");
        require(config.mode == ExecutionMode.Timelock, "Not Timelock mode");
        require(config.executeAfter > 0, "ExecuteAfter not set");
        require(block.timestamp < config.executeAfter, "Already past delay");
        require(msg.sender == config.creator, "Only creator can cancel");

        timelockCancelled[votingId] = true;
        emit TimelockCancelled(votingId, msg.sender);
    }

    /**
     * @notice 执行提案
     */
    function execute(uint256 votingId) external {
        ExecutionConfig storage config = executionConfigs[votingId];
        require(config.isSet, "No execution config");
        require(!executed[votingId], "Already executed");
        require(!timelockCancelled[votingId], "Timelock cancelled");
        require(revealCenter.isResultRevealed(votingId), "Result not revealed yet");
        require(revealCenter.isProposalPassed(votingId), "Proposal not passed");

        (uint256 winningOption,) = revealCenter.getWinningOption(votingId);
        require(winningOption == config.executeOnWinningOption, "Winning option mismatch");

        if (config.mode == ExecutionMode.MultiSig) {
            require(msg.sender == config.multisigAddress, "Only multisig can execute");
        }
        if (config.mode == ExecutionMode.Timelock) {
            require(config.executeAfter > 0, "ExecuteAfter not set");
            require(block.timestamp >= config.executeAfter, "Timelock delay not passed");
        }

        executed[votingId] = true;

        bool success;
        if (config.calldataBytes.length > 0) {
            (success,) = config.target.call{value: config.value}(config.calldataBytes);
        } else {
            (success,) = config.target.call{value: config.value}("");
        }

        emit ProposalActionExecuted(votingId, config.target, config.value, success);
        require(success, "Execution failed");
    }

    function _canExecuteFor(uint256 votingId, address executor) internal view returns (bool canExec, string memory reason) {
        if (!executionConfigs[votingId].isSet) {
            return (false, "No execution config");
        }
        if (executed[votingId]) {
            return (false, "Already executed");
        }
        if (timelockCancelled[votingId]) {
            return (false, "Timelock cancelled");
        }
        if (!revealCenter.isResultRevealed(votingId)) {
            return (false, "Result not revealed yet");
        }
        if (!revealCenter.isProposalPassed(votingId)) {
            return (false, "Proposal not passed");
        }
        ExecutionConfig storage config = executionConfigs[votingId];
        (uint256 winningOption,) = revealCenter.getWinningOption(votingId);
        if (winningOption != config.executeOnWinningOption) {
            return (false, "Winning option mismatch");
        }
        if (config.mode == ExecutionMode.MultiSig) {
            if (executor != config.multisigAddress) {
                return (false, "Only multisig can execute");
            }
        }
        if (config.mode == ExecutionMode.Timelock) {
            if (config.executeAfter == 0) {
                return (false, "Timelock not yet scheduled");
            }
            if (block.timestamp < config.executeAfter) {
                return (false, "Timelock delay not passed");
            }
        }
        return (true, "");
    }

    function canExecuteFor(uint256 votingId, address executor) external view returns (bool canExec, string memory reason) {
        return _canExecuteFor(votingId, executor);
    }

    function canExecute(uint256 votingId) external view returns (bool canExec, string memory reason) {
        return _canExecuteFor(votingId, msg.sender);
    }

    receive() external payable {}

    function getExecutionConfig(uint256 votingId) external view returns (
        uint8 mode,
        address target,
        uint256 value,
        bytes memory calldataBytes,
        uint256 executeOnWinningOption,
        address multisigAddress,
        uint256 timelockDelaySeconds,
        uint256 executeAfter,
        address creator,
        bool isSet,
        bool executed_,
        bool cancelled
    ) {
        ExecutionConfig storage config = executionConfigs[votingId];
        return (
            uint8(config.mode),
            config.target,
            config.value,
            config.calldataBytes,
            config.executeOnWinningOption,
            config.multisigAddress,
            config.timelockDelaySeconds,
            config.executeAfter,
            config.creator,
            config.isSet,
            executed[votingId],
            timelockCancelled[votingId]
        );
    }
}
