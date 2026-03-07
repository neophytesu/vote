/**
 * localhost 轻量部署 - 跳过 PoseidonT3/Semaphore/AnonymousVoting
 * 用法: npm run node 后，npx hardhat run scripts/deploy-localhost-no-anonymous.ts --network localhost
 *
 * 仅支持公开投票(Public)，匿名投票创建时会 revert。
 * 适用于前端联调、不需要匿名功能的场景。
 */
import { network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const { viem } = await network.connect();
  const [deployer] = await viem.getWalletClients();
  if (!deployer) throw new Error("No wallet client");
  const publicClient = await viem.getPublicClient();

  console.log("Deploying (no Semaphore) with account:", deployer.account.address);
  console.log("⚠️  匿名投票已禁用，仅支持公开投票\n");

  // 1-3. 跳过 PoseidonT3, SemaphoreVerifier, Semaphore

  // 4. core + Centers（构造函数注入 votingCore，避免 setVotingCore 被抢先调用）
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

  const executionCenter = await viem.deployContract("ExecutionCenter", [votingFactory.address, revealCenter.address]);
  console.log("ExecutionCenter:", executionCenter.address);

  const txSetCenters = await votingFactory.write.setCenters([
    registrationCenter.address,
    votingCenter.address,
    revealCenter.address,
    statisticsCenter.address,
  ]);
  await publicClient.waitForTransactionReceipt({ hash: txSetCenters });

  const txSetExecution = await votingFactory.write.setExecutionCenter([executionCenter.address]);
  await publicClient.waitForTransactionReceipt({ hash: txSetExecution });

  // 6. AnonymousVotingStub（替代 AnonymousVoting，无 Semaphore 依赖）
  const anonymousVotingStub = await viem.deployContract("AnonymousVotingStub");
  console.log("AnonymousVotingStub:", anonymousVotingStub.address);

  // 6b. EncryptedVotingStub（替代 EncryptedVoting，无同态加密依赖）
  const encryptedVotingStub = await viem.deployContract("EncryptedVotingStub");
  console.log("EncryptedVotingStub:", encryptedVotingStub.address);

  // 7. 配置匿名/加密占位（仅公开投票可用，匿名/加密创建会 revert）
  const txSetAnonymous = await votingFactory.write.setAnonymousVoting([anonymousVotingStub.address]);
  await publicClient.waitForTransactionReceipt({ hash: txSetAnonymous });
  const txSetEncrypted = await votingFactory.write.setEncryptedVoting([encryptedVotingStub.address]);
  await publicClient.waitForTransactionReceipt({ hash: txSetEncrypted });

  const txStatsAnonymous = await statisticsCenter.write.setAnonymousVoting([anonymousVotingStub.address]);
  await publicClient.waitForTransactionReceipt({ hash: txStatsAnonymous });
  const txStatsEncrypted = await statisticsCenter.write.setEncryptedVoting([encryptedVotingStub.address]);
  await publicClient.waitForTransactionReceipt({ hash: txStatsEncrypted });

  // 8. QueryCenter（需要 core 已配置中心地址）
  const queryCenter = await viem.deployContract("QueryCenter", [votingFactory.address]);
  console.log("QueryCenter:", queryCenter.address);

  console.log("\n✅ 部署完成（仅公开投票，无匿名/无加密）!");

  const addresses = {
    "VotingFactoryModule#VotingFactory": votingFactory.address,
    "VotingFactoryModule#AnonymousVoting": anonymousVotingStub.address,
    "VotingFactoryModule#EncryptedVoting": encryptedVotingStub.address,
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
  console.log("\n运行 npm run deploy-and-update -- --network localhost 可更新前端地址");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
