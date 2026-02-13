import { Contract, type Provider } from "ethers";

const SEMAPHORE_ABI = [
  "event MemberAdded(uint256 indexed groupId, uint256 index, uint256 identityCommitment, uint256 merkleTreeRoot)",
] as const;

/**
 * 从链上 Semaphore 合约获取指定群组的成员（按 index 排序的 identityCommitment 列表）
 */
export async function fetchSemaphoreGroupMembers(
  provider: Provider,
  semaphoreAddress: string,
  groupId: bigint
): Promise<bigint[]> {
  const contract = new Contract(semaphoreAddress, SEMAPHORE_ABI, provider);
  const filter = contract.filters.MemberAdded(groupId);
  const events = await contract.queryFilter(filter);

  interface EventWithArgs {
    args?: readonly [bigint, bigint, bigint, bigint];
  }
  const byIndex: { index: number; commitment: bigint }[] = events.map((e) => {
    const args = (e as EventWithArgs).args!;
    return { index: Number(args[1]), commitment: args[2] };
  });
  byIndex.sort((a, b) => a.index - b.index);
  return byIndex.map((x) => x.commitment);
}
