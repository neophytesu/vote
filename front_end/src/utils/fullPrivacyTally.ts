import { Contract, Interface, hexlify, type Provider } from "ethers";
import { AnonymousVotingABI } from "@/contracts/abi";

const anonInterface = new Interface([...AnonymousVotingABI]);

/** ethers v6 解析 calldata 时 bytes 常为 Uint8Array，须统一为 0x  hex 供 Paillier 工具使用 */
function ballotArgToHex(v: unknown): string {
  if (v == null) return "0x";
  if (typeof v === "string") return v.startsWith("0x") ? v : `0x${v}`;
  return hexlify(v as Uint8Array);
}

/**
 * 从链上交易解析完全隐私选票密文（bytes）。
 * 依赖 FullPrivacyBallotCast 事件定位交易，再解析 calldata（castVoteFullPrivacy / Weighted）。
 */
export async function fetchFullPrivacyBallotHexes(
  provider: Provider,
  anonymousVotingAddress: string,
  votingId: number,
  fromBlock: number | string = 0
): Promise<string[]> {
  const contract = new Contract(anonymousVotingAddress, AnonymousVotingABI, provider);
  // indexed uint256 用 BigInt 与链上 topic 编码一致
  const filter = contract.filters.FullPrivacyBallotCast(BigInt(votingId));

  let logs;
  try {
    logs = await contract.queryFilter(filter, fromBlock, "latest");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 部分节点限制单次 log 扫描范围过大：缩小窗口重试
    if (msg.includes("range") || msg.includes("10000") || msg.includes("block")) {
      const latest = await provider.getBlockNumber();
      const window = 50_000;
      const start = Math.max(0, latest - window);
      logs = await contract.queryFilter(filter, start, "latest");
    } else {
      throw e;
    }
  }

  logs.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return Number(a.blockNumber) - Number(b.blockNumber);
    return a.index - b.index;
  });

  const hexes: string[] = [];
  for (const log of logs) {
    const txHash = log.transactionHash;
    if (!txHash) continue;
    const tx = await provider.getTransaction(txHash);
    if (!tx?.data) continue;
    let parsed;
    try {
      parsed = anonInterface.parseTransaction({ data: tx.data });
    } catch {
      continue;
    }
    if (!parsed) continue;
    if (parsed.name === "castVoteFullPrivacy") {
      const vid = Number(parsed.args[0]);
      if (vid !== votingId) continue;
      hexes.push(ballotArgToHex(parsed.args[1]));
    } else if (parsed.name === "castVoteFullPrivacyWeighted") {
      const vid = Number(parsed.args[0]);
      if (vid !== votingId) continue;
      hexes.push(ballotArgToHex(parsed.args[1]));
    }
  }

  if (logs.length > 0 && hexes.length === 0) {
    throw new Error(
      "链上有 FullPrivacyBallotCast 事件，但无法解析投票交易数据（可能交易非直接调用 AnonymousVoting 或 ABI 不匹配）"
    );
  }

  return hexes;
}
