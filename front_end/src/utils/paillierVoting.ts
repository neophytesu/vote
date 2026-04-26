/**
 * Paillier 同态加密 - 用于加密投票和完全隐私投票
 *
 * 选票编码：对于 N 个选项，选择第 optionIndex 项时加密向量 [0,...,1,...,0]
 * 同态性质：Enc(a) * Enc(b) = Enc(a+b)，可链下聚合后解密得到各选项总票数
 */
import * as paillier from "paillier-bigint";

export interface PaillierPublicKeyJson {
  n: string;
  g: string;
}

export interface PaillierPrivateKeyJson {
  lambda: string;
  mu: string;
  n: string;
  g: string;
}

const CIPHERTEXT_HEX_LEN = 1024; // 2048-bit n -> n^2 约 4096 bits = 1024 hex chars
const DEFAULT_KEY_BITS = 2048;

/**
 * 生成 Paillier 密钥对
 */
export async function generatePaillierKeyPair(
  bitLength: number = DEFAULT_KEY_BITS
): Promise<{ publicKey: paillier.PublicKey; privateKey: paillier.PrivateKey }> {
  return paillier.generateRandomKeys(bitLength);
}

/**
 * 序列化公钥为 JSON（用于存储到提案描述或 localStorage）
 */
export function serializePublicKey(publicKey: paillier.PublicKey): PaillierPublicKeyJson {
  return {
    n: publicKey.n.toString(),
    g: publicKey.g.toString(),
  };
}

/**
 * 从 JSON 反序列化公钥
 */
export function deserializePublicKey(json: PaillierPublicKeyJson): paillier.PublicKey {
  return new paillier.PublicKey(BigInt(json.n), BigInt(json.g));
}

/**
 * 序列化私钥为 JSON（用于存储到 localStorage，仅创建者使用）
 */
export function serializePrivateKey(privateKey: paillier.PrivateKey): PaillierPrivateKeyJson {
  return {
    lambda: privateKey.lambda.toString(),
    mu: privateKey.mu.toString(),
    n: privateKey.publicKey.n.toString(),
    g: privateKey.publicKey.g.toString(),
  };
}

/**
 * 从 JSON 反序列化私钥
 */
export function deserializePrivateKey(json: PaillierPrivateKeyJson): paillier.PrivateKey {
  const publicKey = new paillier.PublicKey(BigInt(json.n), BigInt(json.g));
  return new paillier.PrivateKey(BigInt(json.lambda), BigInt(json.mu), publicKey);
}

/**
 * 加密单张选票（简单多数：选择 optionIndex，optionCount 个选项）
 * 返回向量 [Enc(0),...,Enc(1),...,Enc(0)]，序列化为 hex bytes
 */
export function encryptVote(
  publicKey: paillier.PublicKey,
  optionIndex: number,
  optionCount: number
): string {
  const ciphertexts: bigint[] = [];
  for (let i = 0; i < optionCount; i++) {
    const plaintext = i === optionIndex ? 1n : 0n;
    ciphertexts.push(publicKey.encrypt(plaintext));
  }
  return ciphertextsToHex(ciphertexts);
}

/**
 * 将密文数组序列化为 hex 字符串（0x 前缀，用于合约 bytes）
 */
function ciphertextsToHex(ciphertexts: bigint[]): string {
  const parts = ciphertexts.map((c) => c.toString(16).padStart(CIPHERTEXT_HEX_LEN, "0"));
  return "0x" + parts.join("");
}

/**
 * 从 hex 反序列化密文数组
 */
function hexToCiphertexts(hex: string): bigint[] {
  const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
  const count = raw.length / CIPHERTEXT_HEX_LEN;
  const ciphertexts: bigint[] = [];
  for (let i = 0; i < count; i++) {
    const slice = raw.slice(i * CIPHERTEXT_HEX_LEN, (i + 1) * CIPHERTEXT_HEX_LEN);
    ciphertexts.push(BigInt("0x" + slice));
  }
  return ciphertexts;
}

/**
 * 同态聚合多张加密选票（密文逐分量相乘）
 * 输入：多张选票的 hex 字符串
 * 输出：聚合后的密文 hex
 */
export function aggregateEncryptedBallots(
  publicKey: paillier.PublicKey,
  ballotHexes: string[]
): string {
  if (ballotHexes.length === 0) throw new Error("No ballots to aggregate");
  const optionCount = hexToCiphertexts(ballotHexes[0]).length;
  const aggregated: bigint[] = [];
  for (let i = 0; i < optionCount; i++) {
    let product = 1n;
    for (const hex of ballotHexes) {
      const cts = hexToCiphertexts(hex);
      if (cts.length !== optionCount) throw new Error("Ballot option count mismatch");
      product = (product * cts[i]) % publicKey.n ** 2n;
    }
    aggregated.push(product);
  }
  return ciphertextsToHex(aggregated);
}

/**
 * 解密聚合后的密文，得到各选项票数
 */
export function decryptTally(
  privateKey: paillier.PrivateKey,
  aggregatedHex: string
): number[] {
  const ciphertexts = hexToCiphertexts(aggregatedHex);
  return ciphertexts.map((c) => Number(privateKey.decrypt(c)));
}

/**
 * 从提案描述中解析公钥（格式：<!--PAILLIER_PK:{"n":"...","g":"..."}-->）
 */
export function parsePublicKeyFromDescription(description: string): PaillierPublicKeyJson | null {
  const match = description.match(/<!--PAILLIER_PK:(.+?)-->/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as PaillierPublicKeyJson;
  } catch {
    return null;
  }
}

/** UI 展示用：去掉链上 description 末尾嵌入的 Paillier 公钥注释（解析公钥请仍用原始字符串） */
export function stripPublicKeyFromDescription(description: string): string {
  return description
    .replace(/<!--PAILLIER_PK:[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

/**
 * 将公钥追加到描述末尾（链上仅存 description 时的权宜之计；展示请用 stripPublicKeyFromDescription）
 */
export function appendPublicKeyToDescription(
  description: string,
  publicKey: paillier.PublicKey
): string {
  const json = JSON.stringify(serializePublicKey(publicKey));
  return `${description}\n\n<!--PAILLIER_PK:${json}-->`;
}
