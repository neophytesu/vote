# Sample Hardhat 3 Beta Project (`node:test` and `viem`)

This project showcases a Hardhat 3 Beta project using the native Node.js test runner (`node:test`) and the `viem` library for Ethereum interactions.

To learn more about the Hardhat 3 Beta, please visit the [Getting Started guide](https://hardhat.org/docs/getting-started#getting-started-with-hardhat-3). To share your feedback, join our [Hardhat 3 Beta](https://hardhat.org/hardhat3-beta-telegram-group) Telegram group or [open an issue](https://github.com/NomicFoundation/hardhat/issues/new) in our GitHub issue tracker.

## Project Overview

This example project includes:

- A simple Hardhat configuration file.
- Foundry-compatible Solidity unit tests.
- TypeScript integration tests using [`node:test`](nodejs.org/api/test.html), the new Node.js native test runner, and [`viem`](https://viem.sh/).
- Examples demonstrating how to connect to different types of networks, including locally simulating OP mainnet.

## Usage

### Running Tests

To run all the tests in the project, execute the following command:

```shell
npx hardhat test
```

You can also selectively run the Solidity or `node:test` tests:

```shell
npx hardhat test solidity
npx hardhat test nodejs
```

### Make a deployment to Sepolia

This project includes an example Ignition module to deploy the contract. You can deploy this module to a locally simulated chain or to Sepolia.

To run the deployment to a local chain:

```shell
npx hardhat ignition deploy ignition/modules/Counter.ts
```

To run the deployment to Sepolia, you need an account with funds to send the transaction. The provided Hardhat configuration includes a Configuration Variable called `SEPOLIA_PRIVATE_KEY`, which you can use to set the private key of the account you want to use.

You can set the `SEPOLIA_PRIVATE_KEY` variable using the `hardhat-keystore` plugin or by setting it as an environment variable.

To set the `SEPOLIA_PRIVATE_KEY` config variable using `hardhat-keystore`:

```shell
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
```

After setting the variable, you can run the deployment with the Sepolia network:

```shell
npx hardhat ignition deploy --network sepolia ignition/modules/Counter.ts
```

---

## 前端联调（无匿名/无加密）

与前端联调时，使用「仅公开投票」部署，不依赖 Semaphore/同态加密，启动更快。

### 步骤

**1. 终端一：启动本地链**

```bash
npm run node
```

保持运行。若出现 `EMFILE: too many open files`，可先执行 `ulimit -n 65536` 或新开终端再运行。

**2. 终端二：部署合约并更新前端地址**

```bash
npm run deploy:local:no-anonymous
```

会部署到 `http://127.0.0.1:8545` 并写入 `front_end/src/contracts/abi.ts` 的 localhost 地址。

**3. 终端三：启动前端**

```bash
cd front_end && npm run dev
```

**4. 浏览器**

- 安装 MetaMask，添加网络：RPC URL `http://127.0.0.1:8545`，链 ID `31337`
- 导入测试账户私钥（`npm run node` 启动时终端里打印的 Account #0 的 Private Key）
- 打开前端页面，连接钱包并切换到 Localhost 网络即可联调

### 说明

- 联调环境仅支持**公开投票**；创建匿名/加密投票会 revert。
- 完整功能（含匿名、加密）请使用：`npm run deploy:local`（需先 `npm run node`）。
