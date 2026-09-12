import { TILES } from './board';
import {
  BAIL,
  RAILWAY_FARE,
  redeemCost,
  sellBuildingRefund,
  upgradeCost,
  priceOf
} from './rules';
import type { AIDifficulty, GameState, Player } from './types';

/** 不同难度的现金储备线：储备越高的 AI 越谨慎 */
export function reserveOf(p: Player): number {
  switch (p.difficulty) {
    case 'easy':
      return 800;
    case 'hard':
      return 4200;
    default:
      return 2200;
  }
}

export function aiThinkMs(p: Player): number {
  switch (p.difficulty) {
    case 'easy':
      return 1300;
    case 'hard':
      return 650;
    default:
      return 950;
  }
}

function countSameRegion(state: GameState, tile: number, pid: number): number {
  const region = TILES[tile].city?.region;
  if (!region) return 0;
  let n = 0;
  state.tiles.forEach((ts, i) => {
    if (ts.owner === pid && TILES[i].city?.region === region) n++;
  });
  return n;
}

/** 是否购买无主地产 */
export function aiDecideBuy(state: GameState, p: Player, tile: number): boolean {
  const price = priceOf(tile);
  if (p.cash < price) return false;
  const same = countSameRegion(state, tile, p.id);
  // 凑齐地区：已拥有该地区其他城市时更积极
  if (same > 0 && p.cash - price >= reserveOf(p) * 0.5) return true;
  return p.cash - price >= reserveOf(p);
}

/** 是否支付保释金出狱 */
export function aiDecideBail(p: Player): boolean {
  return p.cash >= BAIL + reserveOf(p) * 0.6;
}

/** 传送阵：是否支付灵石再掷一次 */
export function aiDecideRailway(p: Player): boolean {
  return p.cash >= RAILWAY_FARE + reserveOf(p);
}

/** 回合内资产管理：返回要执行的操作序列 */
export interface AIAction {
  kind: 'upgrade' | 'redeem';
  tile: number;
}

export function aiPlanActions(state: GameState, p: Player): AIAction[] {
  const acts: AIAction[] = [];
  const reserve = reserveOf(p);
  const owned = state.tiles.map((ts, i) => ({ ts, i })).filter(({ ts }) => ts.owner === p.id);

  // 赎回：现金充裕时优先赎回，恢复租金收入
  for (const { ts, i } of owned) {
    if (ts.mortgaged && p.cash - redeemCost(i) > reserve + 1500) {
      acts.push({ kind: 'redeem', tile: i });
    }
  }

  // 升级：优先凑地区联动（该地区已拥有数量多者优先），再按地价
  const score = (i: number) => {
    const region = TILES[i].city!.region;
    const same = countSameRegion(state, i, p.id);
    const total = TILES.filter((t) => t.city?.region === region).length;
    return same * 100 + (same === total - 1 ? 500 : 0) + priceOf(i) * 0.1;
  };
  const upgradable = owned
    .filter(({ ts, i }) => !ts.mortgaged && ts.level < 3 && p.cash - upgradeCost(priceOf(i)) > reserve)
    .sort((a, b) => score(b.i) - score(a.i));
  // 每回合最多升 2 级，模拟“细水长流”
  for (const u of upgradable.slice(0, 2)) {
    if (p.cash - upgradeCost(priceOf(u.i)) > reserve) acts.push({ kind: 'upgrade', tile: u.i });
  }
  return acts;
}

/** 负债自动清算：先卖房、再抵押；处理到无法处理为止（是否还需破产由调用方判断） */
export function aiLiquidateActions(state: GameState, p: Player): Array<{ kind: 'sell' | 'mortgage'; tile: number }> {
  const out: Array<{ kind: 'sell' | 'mortgage'; tile: number }> = [];
  const sellables = () =>
    state.tiles
      .map((ts, i) => ({ ts, i }))
      .filter(({ ts }) => ts.owner === p.id && !ts.mortgaged && ts.level > 0)
      .sort((a, b) => sellBuildingRefund(a.i) - sellBuildingRefund(b.i));
  const mortgageables = () =>
    state.tiles
      .map((ts, i) => ({ ts, i }))
      .filter(({ ts }) => ts.owner === p.id && !ts.mortgaged)
      .sort((a, b) => priceOf(a.i) - priceOf(b.i));

  let guard = 0;
  while (p.cash < 0 && guard++ < 200) {
    const s = sellables()[0];
    if (s) {
      out.push({ kind: 'sell', tile: s.i });
      s.ts.level -= 1;
      p.cash += sellBuildingRefund(s.i);
      continue;
    }
    const m = mortgageables()[0];
    if (m) {
      out.push({ kind: 'mortgage', tile: m.i });
      m.ts.mortgaged = true;
      p.cash += Math.round(priceOf(m.i) / 2);
      continue;
    }
    break;
  }
  return out;
}

export function aiDifficultyLabel(d: AIDifficulty): string {
  return d === 'easy' ? '简单' : d === 'hard' ? '困难' : '普通';
}
