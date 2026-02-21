/**
 * 完整部署脚本 - 使用 Viem 替代 Ignition
 * 用法: npx hardhat run scripts/deploy-full.ts --network localhost
 * 或:  npm run deploy:hardhat  (使用 hardhatMainnet，适用于无 localhost 节点时验证部署)
 */
import { network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// localhost 节点部署大合约时 gas 估算可能失败，使用显式 gas 绕过
const GAS_LIMIT = 30_000_000n;

async function resetLocalhostNode() {
  const rpcUrl = process.env.HARDHAT_NETWORK === "localhost" ? "http://127.0.0.1:8545" : null;
  if (!rpcUrl) return;
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "hardhat_reset",
        params: [{ allowUnlimitedContractSize: true, blockGasLimit: "0x1C9C380" }],
      }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    console.log("已对 localhost 节点执行 hardhat_reset (allowUnlimitedContractSize)");
  } catch (e) {
    console.warn("hardhat_reset 失败，继续部署:", (e as Error).message);
  }
}

async function main() {
  if (process.env.HARDHAT_NETWORK === "localhost") {
    await resetLocalhostNode();
  }

  const { viem } = await network.connect();
  const [deployer] = await viem.getWalletClients();
  if (!deployer) throw new Error("No wallet client");
  const publicClient = await viem.getPublicClient();

  console.log("Deploying with account:", deployer.account.address);

  const gasOverrides = { gas: GAS_LIMIT };

  // 1. PoseidonT3
  const poseidonT3 = await viem.deployContract("PoseidonT3", [], gasOverrides);
  console.log("PoseidonT3:", poseidonT3.address);

  // 2. SemaphoreVerifier
  const semaphoreVerifier = await viem.deployContract("SemaphoreVerifier", [], gasOverrides);
  console.log("SemaphoreVerifier:", semaphoreVerifier.address);

  // 3. Semaphore (with library)
  const semaphore = await viem.deployContract(
    "Semaphore",
    [semaphoreVerifier.address],
    {
      libraries: {
        "npm/poseidon-solidity@0.0.5/PoseidonT3.sol:PoseidonT3": poseidonT3.address as `0x${string}`,
      },
      ...gasOverrides,
    }
  );
  console.log("Semaphore:", semaphore.address);

  // 4. Centers
  const votingFactory = await viem.deployContract("VotingFactory", []);
  console.log("VotingFactory:", votingFactory.address);

  const registrationCenter = await viem.deployContract("RegistrationCenter", [votingFactory.address]);
  console.log("RegistrationCenter:", registrationCenter.address);

  const votingCenter = await viem.deployContract("VotingCenter", [votingFactory.address, registrationCenter.address]);
  console.log("VotingCenter:", votingCenter.address);

  const revealCenter = await viem.deployContract("RevealCenter", [votingFactory.address]);
  console.log("RevealCenter:", revealCenter.address);

  const statisticsCenter = await viem.deployContract("StatisticsCenter", [votingFactory.address]);
  console.log("StatisticsCenter:", statisticsCenter.address);

  // 4b. ExecutionCenter（可选执行机制）
  const executionCenter = await viem.deployContract("ExecutionCenter", [votingFactory.address, revealCenter.address]);
  console.log("ExecutionCenter:", executionCenter.address);

  // 5. Core 配置中心地址（只需一次）
  const txSetCenters = await votingFactory.write.setCenters([
    registrationCenter.address,
    votingCenter.address,
    revealCenter.address,
    statisticsCenter.address,
  ]);
  await publicClient.waitForTransactionReceipt({ hash: txSetCenters });

  const txSetExecution = await votingFactory.write.setExecutionCenter([executionCenter.address]);
  await publicClient.waitForTransactionReceipt({ hash: txSetExecution });

  // 6. AnonymousVoting
  const anonymousVoting = await viem.deployContract(
    "AnonymousVoting",
    [
      votingFactory.address,
      semaphore.address,
      registrationCenter.address,
      votingCenter.address,
      statisticsCenter.address,
    ],
    gasOverrides
  );
  console.log("AnonymousVoting:", anonymousVoting.address);

  // 6c. EncryptedVoting
  const encryptedVoting = await viem.deployContract(
    "EncryptedVoting",
    [
      votingFactory.address,
      registrationCenter.address,
      votingCenter.address,
      statisticsCenter.address,
    ],
    gasOverrides
  );
  console.log("EncryptedVoting:", encryptedVoting.address);

  // 7. QueryCenter
  const queryCenter = await viem.deployContract("QueryCenter", [votingFactory.address]);
  console.log("QueryCenter:", queryCenter.address);

  // 8. 配置（VotingFactory.setAnonymousVoting 会传播到各中心）
  const txSetAnonymous = await votingFactory.write.setAnonymousVoting([anonymousVoting.address]);
  await publicClient.waitForTransactionReceipt({ hash: txSetAnonymous });
  const txSetEncrypted = await votingFactory.write.setEncryptedVoting([encryptedVoting.address]);
  await publicClient.waitForTransactionReceipt({ hash: txSetEncrypted });

  const txStatsAnonymous = await statisticsCenter.write.setAnonymousVoting([anonymousVoting.address]);
  await publicClient.waitForTransactionReceipt({ hash: txStatsAnonymous });
  const txStatsEncrypted = await statisticsCenter.write.setEncryptedVoting([encryptedVoting.address]);
  await publicClient.waitForTransactionReceipt({ hash: txStatsEncrypted });

  console.log("\n✅ 部署完成!");

  const addresses = {
    "VotingFactoryModule#VotingFactory": votingFactory.address,
    "VotingFactoryModule#AnonymousVoting": anonymousVoting.address,
    "VotingFactoryModule#EncryptedVoting": encryptedVoting.address,
    "VotingFactoryModule#RegistrationCenter": registrationCenter.address,
    "VotingFactoryModule#VotingCenter": votingCenter.address,
    "VotingFactoryModule#RevealCenter": revealCenter.address,
    "VotingFactoryModule#StatisticsCenter": statisticsCenter.address,
    "VotingFactoryModule#ExecutionCenter": executionCenter.address,
    "VotingFactoryModule#QueryCenter": queryCenter.address,
  };

  const deploymentDir = path.join(__dirname, "../ignition/deployments/chain-31337");
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(deploymentDir, "deployed_addresses.json"),
    JSON.stringify(addresses, null, 2)
  );
  console.log("\n地址已写入 ignition/deployments/chain-31337/deployed_addresses.json");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
