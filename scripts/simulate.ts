/**
 * 无头规则仿真与校验（任务 6：构建 + 规则仿真校验）
 *
 * 覆盖三层验证：
 *   一、规则数值单元校验 —— 直接调用 rules.ts 纯函数，确定性验证租金/升级/维护/抵押/净资产公式
 *   二、棋盘与事件表完整性 —— 32 格布局、地区城市数、事件条目数
 *   三、3 人 AI 完整对局 —— 简单/普通/困难同场跑满全程，校验回合轮转、地产归属、结算排名等不变量
 *   四、严苛经济对局 —— 低起始资金反复对局，用于触发并校验负债清算 / 破产回收路径
 *
 * 运行：npm run sim
 */
import { GameController } from '../src/game/controller';
import { REGIONS, TILES, regionCityTiles } from '../src/game/board';
import { EVENTS } from '../src/game/events';
import { aiLiquidateActions } from '../src/game/ai';
import {
  JAIL_MAX_TURNS,
  MISFORTUNE_RENT_MULT,
  MONOPOLY_MULT,
  RENT_MULT,
  computeRent,
  maintenanceCost,
  mortgageValue,
  netWorth,
  hasMonopoly,
  redeemCost,
  sellBuildingRefund,
  upgradeCost
} from '../src/game/rules';
import type { GameSettings, GameState, Player, RegionId, TileState } from '../src/game/types';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.error(`  ❌ ${name} ${detail}`);
  }
}

process.on('unhandledRejection', (e) => {
  console.error('未处理异常:', e);
  process.exit(1);
});

// ------------------------------------------------------------------ 测试脚手架
function fakePlayer(over: Partial<Player> = {}): Player {
  return {
    id: 0,
    name: 'P',
    color: '#000',
    isAI: true,
    difficulty: 'normal',
    cash: 0,
    pos: 0,
    inJail: false,
    jailTurns: 0,
    godTurns: 0,
    misfortuneTurns: 0,
    bankrupt: false,
    ...over
  };
}

function blankTiles(): TileState[] {
  return TILES.map(() => ({ owner: null, level: 0, mortgaged: false }));
}

function fakeState(tiles: TileState[] = blankTiles(), players: Player[] = []): GameState {
  return {
    phase: 'idle',
    players,
    current: 0,
    round: 1,
    maxRounds: 30,
    startCash: 15000,
    tiles,
    log: [],
    pendingBuy: null,
    debt: null,
    lastRoll: null,
    modal: null,
    rankings: null,
    seatConfigs: []
  };
}

/** 运行一整局（env=node 无动画），返回终局状态 */
async function runGame(label: string, settings: GameSettings): Promise<GameState> {
  const c = new GameController('node');
  c.newGame(settings);
  let guard = 0;
  let lastPhase = '';
  let stuck = 0;
  while (c.getState().phase !== 'gameover' && guard++ < 100000) {
    await new Promise((r) => setImmediate(r));
    const ph = c.getState().phase;
    if (ph === lastPhase) stuck++;
    else {
      lastPhase = ph;
      stuck = 0;
    }
    if (stuck > 2000) {
      console.error(`\n[${label}] 诊断：停滞于阶段 ${lastPhase}，最近日志：`);
      for (const l of c.getState().log.slice(-8)) console.error('   ', l.text);
      break;
    }
  }
  return c.getState();
}

// ------------------------------------------------------------------ 一、数值单元校验
function unitChecks() {
  console.log('--- 一、规则数值单元校验 ---');

  const owner = fakePlayer({ id: 1 });
  const payer = fakePlayer({ id: 2 });

  // 租金 = 地价 × 等级系数，四舍五入到 10
  const base = Math.round((3400 * RENT_MULT[0]) / 10) * 10;
  check('租金公式·洞府无加成', computeRent(3400, 0, owner, payer, false) === base, `期望 ${base}`);
  check(
    '租金公式·等级越高越贵',
    computeRent(3400, 1, owner, payer, false) > computeRent(3400, 0, owner, payer, false) &&
      computeRent(3400, 2, owner, payer, false) > computeRent(3400, 1, owner, payer, false) &&
      computeRent(3400, 3, owner, payer, false) > computeRent(3400, 2, owner, payer, false)
  );
  check('租金公式·地区联动 ×2', computeRent(3400, 0, owner, payer, true) === base * MONOPOLY_MULT);
  const godOwner = fakePlayer({ id: 1, godTurns: 1 });
  check('租金公式·仙缘 owner ×1.5', computeRent(3400, 0, godOwner, payer, false) === Math.round((base * 1.5) / 10) * 10);
  const unluckyPayer = fakePlayer({ id: 2, misfortuneTurns: 1 });
  check(
    '租金公式·心魔 payer ×1.5',
    computeRent(3400, 0, owner, unluckyPayer, false) === Math.round((base * MISFORTUNE_RENT_MULT) / 10) * 10
  );

  // 升级费 = 售价 × 0.4，取整到 10
  check('升级费公式', upgradeCost(3400) === 1360, `实际 ${upgradeCost(3400)}`);
  // 抵押 = 售价一半
  check('抵押金额 = 售价一半', mortgageValue(1) === 1700, `实际 ${mortgageValue(1)}`);
  // 赎回 = 抵押额 + 10% 手续费，取整到 10
  check('赎回费 = 抵押额 ×1.1', redeemCost(1) === Math.round((1700 * 1.1) / 10) * 10, `实际 ${redeemCost(1)}`);
  // 卖房退款 = 升级投入一半
  check('卖房退款 = 升级投入一半', sellBuildingRefund(1) === Math.round((upgradeCost(3400) * 0.5) / 10) * 10);

  // 灵脉税 = 每栋建筑 250，最低 500
  const emptyState = fakeState(blankTiles(), [owner]);
  check('灵脉税·无建筑保底 500', maintenanceCost(emptyState, owner) === 500);
  const t2 = blankTiles();
  t2[1] = { owner: 1, level: 2, mortgaged: false };
  t2[2] = { owner: 1, level: 1, mortgaged: false };
  check('灵脉税·按建筑层数累计', maintenanceCost(fakeState(t2, [owner]), owner) === 3 * 250, '期望 750');

  // 净资产 = 现金 + 未抵押(售价/2 + 升级投入/2) + 已抵押(售价/4)
  const richPlayer = fakePlayer({ id: 1, cash: 1000 });
  const nt = blankTiles();
  nt[1] = { owner: 1, level: 2, mortgaged: false };
  const expectedNet = 1000 + 3400 / 2 + (2 * upgradeCost(3400)) / 2;
  check('净资产公式·未抵押', netWorth(fakeState(nt, [richPlayer]), richPlayer) === Math.round(expectedNet));
  nt[1].mortgaged = true;
  check('净资产公式·已抵押', netWorth(fakeState(nt, [richPlayer]), richPlayer) === Math.round(1000 + 3400 / 4));

  // 地区联动：需集齐该地区全部城市且均未抵押
  const region: RegionId = 'qingyun';
  const regionTiles = regionCityTiles(region);
  const monoState = fakeState(blankTiles(), [owner]);
  for (const i of regionTiles) monoState.tiles[i] = { owner: 1, level: 0, mortgaged: false };
  check('地区联动·集齐全部城市', hasMonopoly(monoState, 1, region));
  monoState.tiles[regionTiles[0]].mortgaged = true;
  check('地区联动·存在抵押则不成立', !hasMonopoly(monoState, 1, region));
  monoState.tiles[regionTiles[0]] = { owner: 1, level: 0, mortgaged: false };
  monoState.tiles[regionTiles[1]] = { owner: 2, level: 0, mortgaged: false };
  check('地区联动·缺少城市则不成立', !hasMonopoly(monoState, 1, region));

  // 负债清算：先卖房、后抵押，直到现金转正
  const broke = fakePlayer({ id: 1, cash: -3000 });
  const liqState = fakeState(blankTiles(), [broke]);
  liqState.tiles[1] = { owner: 1, level: 2, mortgaged: false };
  liqState.tiles[5] = { owner: 1, level: 0, mortgaged: false };
  const acts = aiLiquidateActions(liqState, broke);
  check('负债清算·现金恢复非负', broke.cash >= 0, `实际 ${broke.cash}`);
  check('负债清算·先拆建筑后抵押', acts.filter((a) => a.kind === 'sell').length === 2 && acts.filter((a) => a.kind === 'mortgage').length === 2);
  check(
    '负债清算·动作顺序正确（sell 在 mortgage 之前）',
    acts.findIndex((a) => a.kind === 'mortgage') > acts.map((a) => a.kind).lastIndexOf('sell')
  );
}

// ------------------------------------------------------------------ 二、棋盘完整性
function boardChecks() {
  console.log('\n--- 二、棋盘与事件表完整性 ---');
  check('棋盘 32 格且序号连续', TILES.length === 32 && TILES.every((t, i) => t.index === i));
  check('四个角格位置正确（登仙台/传送阵/镇妖塔/灵泉）', TILES[0].type === 'start' && TILES[8].type === 'railway' && TILES[16].type === 'jail' && TILES[24].type === 'park');
  check('城池格均有价格且 ≥ 2000', TILES.filter((t) => t.type === 'city').every((t) => (t.city?.price ?? 0) >= 2000));
  check('八大地区均含 ≥ 2 座城市', REGIONS.every((r) => regionCityTiles(r.id).length >= 2));
  check('机缘格 3 个 / 机缘设计 ≥ 12 种', TILES.filter((t) => t.type === 'event').length === 3 && EVENTS.length >= 12, `机缘设计实际 ${EVENTS.length} 种`);
  check('镇妖塔禁制参数正确（3 回合上限）', JAIL_MAX_TURNS === 3);
}

// ------------------------------------------------------------------ 三、完整对局校验
function gameChecks(label: string, s: GameState, seats: 3): void {
  console.log(`\n--- ${label} · 核心规则校验 ---`);
  const totalRolls = s.log.filter((l) => l.text.includes('点')).length;
  const rents = s.log.filter((l) => l.text.includes('过路费')).length;
  const builds = s.log.filter((l) => l.kind === 'build').length;
  const events = s.log.filter((l) => l.kind === 'event').length;
  const bankrupts = s.players.filter((p) => p.bankrupt).length;

  console.log(`结束阶段: ${s.phase}，进行到第 ${s.round} 轮`);
  console.log(`掷骰 ${totalRolls} 次 | 过路费 ${rents} 笔 | 建筑/购地 ${builds} 次 | 事件 ${events} 条 | 破产 ${bankrupts} 人`);

  check('对局正常结束（gameover）', s.phase === 'gameover');
  check('未出现引擎停滞', totalRolls > 0);
  check(`产出结算排名（${seats} 人）`, (s.rankings?.length ?? 0) === seats);
  check('排名按净资产降序', !!s.rankings && s.rankings.every((r, i) => i === 0 || s.rankings![i - 1].net >= r.net));
  check(
    '排名净资产与该玩家净资产一致',
    !!s.rankings && s.rankings.every((r) => r.net === netWorth(s, s.players[r.id]))
  );
  check('发生过路费结算', rents > 0);
  check('发生购地/建筑行为', builds > 0);
  check('发生随机事件', events > 0);
  check('经过登仙台领取俸禄', s.log.some((l) => l.text.includes('领取俸禄')));
  check(
    '3 名玩家均有回合（轮转正常）',
    s.players.every((p) => s.log.some((l) => l.kind === 'turn' && l.text.includes(`${p.name}`) && l.text.includes('的回合')))
  );
  check('回合数不超过上限', s.round <= s.maxRounds);
  check(
    '全部玩家现金为有限数值（无 NaN）',
    s.players.every((p) => Number.isFinite(p.cash))
  );
  check('结束时无玩家负债（现金均非负）', s.players.every((p) => p.cash >= 0));
  check(
    '地产归属数据一致（owner 有效 / level 0-3）',
    s.tiles.every((t) => t.owner === null || (t.owner >= 0 && t.owner < seats)) && s.tiles.every((t) => t.level >= 0 && t.level <= 3)
  );
  check(
    '破产玩家资产已回收',
    s.players.filter((p) => p.bankrupt).every((p) => !s.tiles.some((t) => t.owner === p.id))
  );
}

// ------------------------------------------------------------------ 五、破产处置
async function bankruptcyCheck(): Promise<void> {
  console.log('\n--- 五、破产处置路径校验（构造必然破产场景）---');
  const c = new GameController('node');
  c.newGame({
    seats: [
      { isAI: false, name: '真人', difficulty: 'normal' },
      { isAI: true, name: 'AI-甲', difficulty: 'normal' },
      { isAI: true, name: 'AI-乙', difficulty: 'normal' }
    ],
    startCash: 15000,
    maxRounds: 30
  });
  const s = c.state;

  // 另两家先出局，使破产结算后直接终局，避免触发后续 AI 驱动
  s.players[1].bankrupt = true;
  s.players[2].bankrupt = true;
  s.tiles.forEach((t) => {
    if (t.owner === 1 || t.owner === 2) {
      t.owner = null;
      t.level = 0;
      t.mortgaged = false;
    }
  });

  // 构造资不抵债：现金为负且名下尚存地产（含抵押地产）
  s.current = 0;
  s.phase = 'awaitDebt';
  s.players[0].cash = -8000;
  s.tiles[1] = { owner: 0, level: 2, mortgaged: false };
  s.tiles[5] = { owner: 0, level: 0, mortgaged: true };

  c.declareBankruptcy();
  check('破产·玩家被标记为破产', s.players[0].bankrupt);
  check('破产·现金清零', s.players[0].cash === 0);
  check('破产·名下地产全部回收', !s.tiles.some((t) => t.owner === 0));
  check('破产·地产等级归零', s.tiles.every((t) => t.level === 0));
  check('破产·抵押状态被清除', s.tiles.every((t) => !t.mortgaged));

  // 破产后应自动结算对局
  await new Promise((r) => setTimeout(r, 0));
  const after = c.getState();
  check('破产·对局正确结算并产出排名', after.phase === 'gameover' && (after.rankings?.length ?? 0) === 3);
}

// ------------------------------------------------------------------ 主流程
async function main() {
  console.log('=== 仙域大富翁 · 规则仿真与校验（任务 6） ===\n');

  unitChecks();
  boardChecks();

  // 三、3 人 AI 完整对局（同场竞技：简单 / 普通 / 困难）
  console.log('\n--- 三、3 人 AI 完整对局（简单/普通/困难，15,000 起始 / 30 轮上限）---');
  const standard = await runGame('标准对局', {
    seats: [
      { isAI: true, name: 'AI-简单', difficulty: 'easy' },
      { isAI: true, name: 'AI-普通', difficulty: 'normal' },
      { isAI: true, name: 'AI-困难', difficulty: 'hard' }
    ],
    startCash: 15000,
    maxRounds: 30
  });
  gameChecks('标准对局', standard, 3);
  if (standard.rankings) {
    console.log('\n--- 最终排名 ---');
    standard.rankings.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.name}  净资产 ¥${r.net.toLocaleString('zh-CN')}${r.bankrupt ? '（破产）' : ''}`);
    });
  }

  // 四、严苛经济对局：低起始资金反复对局，压力校验规则不变量
  console.log('\n--- 四、严苛经济对局（3,000 起始 / 60 轮，压力校验）---');
  let harshOK = true;
  for (let i = 1; i <= 3; i++) {
    const g = await runGame(`严苛对局 #${i}`, {
      seats: [
        { isAI: true, name: '甲', difficulty: 'easy' },
        { isAI: true, name: '乙', difficulty: 'normal' },
        { isAI: true, name: '丙', difficulty: 'hard' }
      ],
      startCash: 3000,
      maxRounds: 60
    });
    const nb = g.players.filter((p) => p.bankrupt).length;
    const ok =
      g.phase === 'gameover' &&
      (g.rankings?.length ?? 0) === 3 &&
      g.players.every((p) => p.cash >= 0) &&
      g.players.filter((p) => p.bankrupt).every((p) => !g.tiles.some((t) => t.owner === p.id));
    harshOK = harshOK && ok;
    console.log(`  对局 #${i}: 结束于第 ${g.round} 轮，破产 ${nb} 人，现金 ${g.players.map((p) => p.cash).join(' / ')}`);
  }
  check('严苛对局均正常结算且不变量成立', harshOK);

  // 五、破产处置路径校验（构造必然破产场景，驱动公开的破产流程）
  await bankruptcyCheck();

  console.log(`\n=== 结果: ${pass} 项通过, ${fail} 项失败 ===`);
  if (fail > 0) process.exit(1);
}

void main();
