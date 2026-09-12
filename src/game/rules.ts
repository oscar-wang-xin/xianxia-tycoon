/** 数值规则常量与租金计算 */
import { TILES, regionCityTiles } from './board';
import type { GameState, Player, RegionId } from './types';

export const SALARY = 2000; // 经过/落在登仙台
export const GOD_SALARY_BONUS = 1000; // 仙缘 buff 经过登仙台额外奖励
export const GOD_EVENT_BONUS = 2000; // 落在仙缘格即时奖励
export const MISFORTUNE_HIT = 1500; // 落在心魔格即时扣款
export const GOD_TURNS = 3;
export const MISFORTUNE_TURNS = 3;
export const BAIL = 1000; // 赎身灵石
export const JAIL_MAX_TURNS = 3;
export const RAILWAY_FARE = 800; // 传送阵灵石（可再掷一次）
export const RENT_MULT = [0.07, 0.18, 0.38, 0.7]; // 洞府/楼阁/殿宇/仙宫
export const UPGRADE_RATE = 0.4; // 每级升级费用 = 售价 * 0.4
export const MONOPOLY_MULT = 2; // 宗门联动
export const GOD_RENT_MULT = 1.5;
export const MISFORTUNE_RENT_MULT = 1.5;
export const BUILDING_NAMES = ['洞府', '楼阁', '殿宇', '仙宫'];

export function priceOf(tile: number): number {
  return TILES[tile].city?.price ?? 0;
}

export function upgradeCost(price: number): number {
  return Math.round((price * UPGRADE_RATE) / 10) * 10;
}

export function computeRent(
  price: number,
  level: number,
  owner: Player,
  payer: Player,
  monopoly: boolean
): number {
  let rent = price * RENT_MULT[Math.min(level, 3)];
  if (monopoly) rent *= MONOPOLY_MULT;
  if (owner.godTurns > 0) rent *= GOD_RENT_MULT;
  if (payer.misfortuneTurns > 0) rent *= MISFORTUNE_RENT_MULT;
  return Math.round(rent / 10) * 10;
}

/** 宗门联动：该势力全部城池均属于 pid 且都未抵押 */
export function hasMonopoly(state: GameState, pid: number, region: RegionId): boolean {
  return regionCityTiles(region).every((i) => {
    const ts = state.tiles[i];
    return ts.owner === pid && !ts.mortgaged;
  });
}

const ALL_REGIONS: RegionId[] = ['qingyun', 'wanjian', 'tianji', 'penglai', 'youming', 'wanyao', 'danxia', 'kunlun'];

/** 玩家当前激活的宗门联动列表 */
export function monopolyRegions(state: GameState, pid: number): RegionId[] {
  return ALL_REGIONS.filter((r) => hasMonopoly(state, pid, r));
}

/** 灵脉税：每栋建筑 ¥250，至少 ¥500 */
export function maintenanceCost(state: GameState, p: Player): number {
  let levels = 0;
  state.tiles.forEach((ts) => {
    if (ts.owner === p.id) levels += ts.level;
  });
  return Math.max(500, levels * 250);
}

/** 抵押可贷金额（售价一半） */
export function mortgageValue(tile: number): number {
  return Math.round(priceOf(tile) / 2);
}

/** 赎回费用（抵押额 + 10% 手续费） */
export function redeemCost(tile: number): number {
  return Math.round((mortgageValue(tile) * 1.1) / 10) * 10;
}

/** 卖房退款（升级投入一半） */
export function sellBuildingRefund(tile: number): number {
  return Math.round((upgradeCost(priceOf(tile)) * 0.5) / 10) * 10;
}

/** 玩家可变现资产上限（含卖房 + 抵押），用于判断能否清偿 */
export function liquidationValue(state: GameState, p: Player): number {
  let sum = 0;
  state.tiles.forEach((ts, i) => {
    if (ts.owner !== p.id) return;
    if (!ts.mortgaged) {
      sum += ts.level * sellBuildingRefund(i);
      sum += mortgageValue(i);
    }
  });
  return sum;
}

/** 净资产（结算排名用）：现金 + 未抵押地产(售价/2 + 升级投入/2) + 已抵押地产(售价/4) */
export function netWorth(state: GameState, p: Player): number {
  let sum = p.cash;
  state.tiles.forEach((ts, i) => {
    if (ts.owner !== p.id) return;
    const price = priceOf(i);
    if (ts.mortgaged) {
      sum += price / 4;
    } else {
      sum += price / 2 + (ts.level * upgradeCost(price)) / 2;
    }
  });
  return Math.round(sum);
}

/** 玩家名下地产格列表 */
export function ownedTiles(state: GameState, pid: number): number[] {
  const out: number[] = [];
  state.tiles.forEach((ts, i) => {
    if (ts.owner === pid) out.push(i);
  });
  return out;
}

/** 地产某格当前的过路费（展示用，不含付款方 debuff） */
export function displayRent(state: GameState, tile: number): number {
  const ts = state.tiles[tile];
  const price = priceOf(tile);
  let rent = price * RENT_MULT[Math.min(ts.level, 3)];
  if (ts.owner !== null && hasMonopoly(state, ts.owner, TILES[tile].city!.region)) rent *= MONOPOLY_MULT;
  return Math.round(rent / 10) * 10;
}
