/**
 * 可见性配置（与合约位图对应）
 * 此文件不参与部署脚本生成，可安全修改
 */

/**
 * 可见性级别
 * 0 = 不公开（隐藏）
 * 1 = 仅创建者
 * 2 = 仅参与者（已注册的选民）
 * 3 = 所有人（公开）
 */
export const VisibilityLevel = {
  Hidden: 0,
  CreatorOnly: 1,
  ParticipantsOnly: 2,
  Public: 3,
} as const;
export type VisibilityLevel = (typeof VisibilityLevel)[keyof typeof VisibilityLevel];

/**
 * 可见性配置项
 * 位图布局（每项2位，从低位到高位）：
 * - voteCounts: 位 0-1（实时票数）
 * - voteDetails: 位 2-3（投票详情/谁投了什么）
 * - voterList: 位 4-5（选民列表）
 * - progress: 位 6-7（投票进度）
 * - result: 位 8-9（最终结果）
 */
export interface VisibilityConfig {
  voteCounts: VisibilityLevel;
  voteDetails: VisibilityLevel;
  voterList: VisibilityLevel;
  progress: VisibilityLevel;
  result: VisibilityLevel;
}

/**
 * 将可见性配置编码为位图（uint16）
 */
export function encodeVisibilityBitmap(config: VisibilityConfig): number {
  return (
    (config.voteCounts & 0x3) |
    ((config.voteDetails & 0x3) << 2) |
    ((config.voterList & 0x3) << 4) |
    ((config.progress & 0x3) << 6) |
    ((config.result & 0x3) << 8)
  );
}

/**
 * 从位图解码可见性配置
 */
export function decodeVisibilityBitmap(bitmap: number): VisibilityConfig {
  return {
    voteCounts: (bitmap & 0x3) as VisibilityLevel,
    voteDetails: ((bitmap >> 2) & 0x3) as VisibilityLevel,
    voterList: ((bitmap >> 4) & 0x3) as VisibilityLevel,
    progress: ((bitmap >> 6) & 0x3) as VisibilityLevel,
    result: ((bitmap >> 8) & 0x3) as VisibilityLevel,
  };
}

/**
 * 默认可见性配置
 */
export const DEFAULT_VISIBILITY_CONFIG: VisibilityConfig = {
  voteCounts: VisibilityLevel.CreatorOnly,
  voteDetails: VisibilityLevel.CreatorOnly,
  voterList: VisibilityLevel.CreatorOnly,
  progress: VisibilityLevel.CreatorOnly,
  result: VisibilityLevel.Public,
};

/**
 * 检查用户对某项的可见性权限
 */
export function checkVisibility(
  level: VisibilityLevel,
  isCreator: boolean,
  isParticipant: boolean
): boolean {
  switch (level) {
    case VisibilityLevel.Hidden:
      return false;
    case VisibilityLevel.CreatorOnly:
      return isCreator;
    case VisibilityLevel.ParticipantsOnly:
      return isCreator || isParticipant;
    case VisibilityLevel.Public:
      return true;
    default:
      return false;
  }
}
