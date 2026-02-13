# 合约部署说明

## 快速开始

### 方案 1：hardhatMainnet（推荐，无需节点）

```bash
npm run deploy:hardhat
```

- 在 Hardhat 内置网络上部署，无需先启动节点
- 会更新前端合约地址（`front_end/src/contracts/abi.ts`）
- **注意**：链是临时性的，脚本结束后链状态会消失，仅适用于验证部署流程

### 方案 2：localhost（前端联调，不含匿名投票）

```bash
# 终端 1：启动节点
npm run node

# 终端 2：部署（跳过 PoseidonT3/Semaphore，仅支持公开投票）
npm run deploy:local:no-anonymous
```

- 不部署 PoseidonT3、SemaphoreVerifier、Semaphore、AnonymousVoting
- 使用轻量 `AnonymousVotingStub` 占位，创建匿名投票时会 revert
- **仅公开投票(Public)可用**，适合前端联调

### 方案 2b：localhost（完整部署，含匿名投票）

```bash
# 终端 1：启动节点
npm run node

# 终端 2：部署
npm run deploy:local
```

- **已知问题**：部署 PoseidonT3 等大型 Semaphore 合约时，Hardhat 3 + localhost 节点可能出现 `Internal error (code: -32603)`
- 若失败，使用 `deploy:local:no-anonymous` 或 `deploy:hardhat`

### 方案 3：Sepolia 测试网

配置 `SEPOLIA_RPC_URL` 和 `SEPOLIA_PRIVATE_KEY` 后：

```bash
npx hardhat run scripts/deploy-full.ts --network sepolia
npx hardhat run scripts/deploy-and-update.ts --network sepolia
```

## 脚本说明

| 命令 | 说明 |
|------|------|
| `npm run node` | 启动 localhost 节点 |
| `npm run deploy:local` | 部署到 localhost（完整，含匿名）并更新前端 |
| `npm run deploy:local:no-anonymous` | 部署到 localhost（无 Semaphore，仅公开投票）并更新前端 |
| `npm run deploy:hardhat` | 部署到 hardhatMainnet 并更新前端 |
| `npm run test` | 运行合约测试 |

## 部署输出

- 合约地址写入：`ignition/deployments/chain-31337/deployed_addresses.json`
- 前端地址更新：`front_end/src/contracts/abi.ts`
