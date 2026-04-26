/**
 * 在已部署的 localhost 上创建一条「完全隐私」投票并读取 Semaphore groupId。
 * 用法: npx hardhat run scripts/diagnose-localhost-fullprivacy.ts --network localhost
 */
import { network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ZERO = "0x0000000000000000000000000000000000000000" as `0x${string}`;

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();
  if (!deployer) throw new Error("No wallet");

  const deploymentPath = path.join(__dirname, "../ignition/deployments/chain-31337/deployed_addresses.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("缺少部署文件，请先 npm run deploy:local");
  }
  const deployed = JSON.parse(fs.readFileSync(deploymentPath, "utf-8")) as Record<string, string>;
  const vfAddr = deployed["VotingFactoryModule#VotingFactory"] as `0x${string}`;
  const avAddr = deployed["VotingFactoryModule#AnonymousVoting"] as `0x${string}`;

  const votingFactory = await viem.getContractAt("VotingFactory", vfAddr);
  const anonymousVoting = await viem.getContractAt("AnonymousVoting", avAddr);

  const block = await publicClient.getBlock();
  const now = Number(block.timestamp);
  const params = {
    title: "diagnose-fullprivacy",
    description: "hardhat diagnose",
    options: ["A", "B"],
    votingRule: 0,
    privacyLevel: 3,
    registrationStart: BigInt(now + 30),
    registrationEnd: BigInt(now + 120),
    votingStart: BigInt(now + 120),
    votingEnd: BigInt(now + 300),
    quorum: 0n,
    autoAdvance: false,
    visibilityBitmap: 0,
    enableWhitelist: false,
    whitelist: [] as readonly `0x${string}`[],
    whitelistGroupIndexes: [] as readonly bigint[],
    weightGroupNames: [] as readonly string[],
    weightGroupWeights: [] as readonly bigint[],
    registrationRule: 0,
    tokenContractAddress: ZERO,
    tokenMinBalance: 0n,
    useBlockNumber: false,
    allowExtension: true,
    snapshotBlockNumber: 0n,
    executionMode: 0,
    executionTarget: ZERO,
    executionValue: 0n,
    executionCalldata: "0x" as `0x${string}`,
    executionOnWinningOption: 0n,
    executionMultisig: ZERO,
    executionTimelockDelay: 0n,
    useThresholdDecryption: false,
    thresholdCommittee: [] as readonly `0x${string}`[],
    thresholdT: 0,
    revealDelay: 0n,
  };

  const hash = await votingFactory.write.createVoting([params]);
  await publicClient.waitForTransactionReceipt({ hash });
  const votingId = await votingFactory.read.votingCount();
  const groupId = await anonymousVoting.read.votingSemaphoreGroupId([votingId]);
  const hasGroup = await anonymousVoting.read.hasSemaphoreGroup([votingId]);

  console.log("部署 VotingFactory:", vfAddr);
  console.log("部署 AnonymousVoting:", avAddr);
  console.log("创建者:", deployer.account.address);
  console.log("新建 votingId:", votingId.toString());
  console.log("votingSemaphoreGroupId:", groupId.toString(), "（Semaphore 首个群常为 0，属正常）");
  console.log("hasSemaphoreGroup:", hasGroup);

  if (!hasGroup) {
    console.error("\n❌ hasSemaphoreGroup 为 false：请确认全量部署且 createVoting(FullPrivacy) 成功。");
    process.exitCode = 1;
  } else {
    console.log("\n✅ localhost 全量部署下完全隐私投票已正确创建 Semaphore 群组。");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
