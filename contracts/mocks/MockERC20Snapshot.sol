// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title MockERC20Snapshot
 * @notice 测试用 ERC20：支持 balanceOf、mint、transfer 与 getPastVotes（快照投票用）
 * @dev getPastVotes 需通过 setPastBalance 由测试脚本设置历史区块余额
 */
contract MockERC20Snapshot {
    string public name = "Mock Token";
    string public symbol = "MOCK";
    uint8 public decimals = 18;

    mapping(address => uint256) private _balances;
    /// @notice 测试用：account => blockNumber => 该区块时的余额（由 setPastBalance 设置）
    mapping(address => mapping(uint256 => uint256)) private _pastBalances;

    event Transfer(address indexed from, address indexed to, uint256 value);

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function mint(address account, uint256 amount) external {
        _balances[account] += amount;
        emit Transfer(address(0), account, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        address from = msg.sender;
        require(_balances[from] >= amount, "Insufficient balance");
        _balances[from] -= amount;
        _balances[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    /// @notice 兼容 EIP-5805 / ERC20Votes：返回指定区块时该账户的余额（测试用，由 setPastBalance 设置）
    function getPastVotes(address account, uint256 blockNumber) external view returns (uint256) {
        return _pastBalances[account][blockNumber];
    }

    /// @notice 测试用：设置某账户在某区块的“历史余额”，用于快照投票测试
    function setPastBalance(address account, uint256 blockNumber, uint256 amount) external {
        _pastBalances[account][blockNumber] = amount;
    }
}
