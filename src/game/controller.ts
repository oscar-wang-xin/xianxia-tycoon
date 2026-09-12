import { JAIL_TILE, START_TILE, TILES } from './board';
import * as ai from './ai';
import { pickEvent, type EventCtx } from './events';
import * as save from './save';
import {
  BAIL,
  BUILDING_NAMES,
  GOD_EVENT_BONUS,
  GOD_SALARY_BONUS,
  GOD_TURNS,
  JAIL_MAX_TURNS,
  MISFORTUNE_HIT,
  MISFORTUNE_TURNS,
  RAILWAY_FARE,
  SALARY,
  computeRent,
  hasMonopoly,
  maintenanceCost,
  mortgageValue,
  netWorth,
  ownedTiles,
  priceOf,
  redeemCost,
  sellBuildingRefund,
  upgradeCost
} from './rules';
import type {
  ChoiceModal,
  EngineHooks,
  GameSettings,
  GameState,
  Player,
  Ranking,
  SeatConfig
} from './types';

export const PLAYER_COLORS = ['#d84b3a', '#2f8f5b', '#3d7bd9', '#e8a33d'];

export function defaultSeats(): SeatConfig[] {
  const names = ['玩家一', '玩家二', '玩家三', '玩家四'];
  return names.map((name, i) => ({
    isAI: i > 0,
    name,
    difficulty: 'normal' as const
  }));
}

export function defaultSettings(): GameSettings {
  return { seats: defaultSeats().slice(0, 3), startCash: 15000, maxRounds: 30 };
}

type LogKind = 'info' | 'money' | 'event' | 'build' | 'turn';

/**
 * 游戏主控制器：全部规则在前端运行，无任何后端。
 * env='node' 时跳过动画/延时，供规则仿真脚本使用。
 */
export class GameController {
  state: GameState;
  hooks: EngineHooks = {};
  private env: 'browser' | 'node';
  private listeners = new Set<() => void>();
  private busy = false;
  private extraRoll = false;
  private logId = 1;
  private modalResolve: ((choice: 'ok' | 'skip') => void) | null = null;
  private debtResolve: (() => void) | null = null;
  private aiDriving = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private snapshot: GameState;

  constructor(env: 'browser' | 'node' = 'browser') {
    this.env = env;
    const s = defaultSettings();
    this.state = this.freshState(s);
    this.snapshot = { ...this.state };
  }

  // ---------------------------------------------------------------- 基础
  private freshState(settings: GameSettings): GameState {
    return {
      phase: 'idle',
      players: [],
      current: 0,
      round: 1,
      maxRounds: settings.maxRounds,
      startCash: settings.startCash,
      tiles: TILES.map(() => ({ owner: null, level: 0, mortgaged: false })),
      log: [],
      pendingBuy: null,
      debt: null,
      lastRoll: null,
      modal: null,
      rankings: null,
      seatConfigs: settings.seats
    };
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = (): GameState => this.snapshot;

  private emit(): void {
    // 内部始终使用同一可变 state；对外发布浅拷贝快照供 React 感知变化
    this.snapshot = { ...this.state };
    for (const fn of this.listeners) fn();
    if (this.env === 'browser') {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => save.writeSave(this.state), 400);
    }
  }

  private addLog(text: string, kind: LogKind = 'info'): void {
    this.state.log.push({ id: this.logId++, round: this.state.round, text, kind });
    if (this.state.log.length > 400) this.state.log.splice(0, this.state.log.length - 400);
  }

  private float(pid: number, amount: number, tile?: number): void {
    try {
      this.hooks.money?.(pid, amount, tile);
    } catch {
      /* 渲染层异常不影响规则 */
    }
  }

  private sleep(ms: number): Promise<void> {
    if (this.env === 'node') return Promise.resolve();
    return new Promise((r) => setTimeout(r, ms));
  }

  // ---------------------------------------------------------------- 开局
  newGame(settings: GameSettings): void {
    save.clearSave();
    this.busy = false;
    this.extraRoll = false;
    this.modalResolve = null;
    this.debtResolve = null;
    const base = this.freshState(settings);
    base.players = settings.seats.map((seat, i) => ({
      id: i,
      name: seat.name?.trim() || `玩家 ${i + 1}`,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      isAI: seat.isAI,
      difficulty: seat.difficulty,
      cash: settings.startCash,
      pos: START_TILE,
      inJail: false,
      jailTurns: 0,
      godTurns: 0,
      misfortuneTurns: 0,
      bankrupt: false
    }));
    this.state = base;
    this.addLog(`对局开始：${base.players.length} 位玩家，初始资金 ${settings.startCash} 元，上限 ${settings.maxRounds} 轮`, 'turn');
    this.startTurn();
    this.emit();
  }

  continueGame(): void {
    const loaded = save.loadSave();
    if (!loaded) return;
    this.state = loaded;
    this.extraRoll = false;
    this.busy = false;
    this.emit();
    const p = this.state.players[this.state.current];
    if (p?.isAI && this.state.phase !== 'gameover') this.scheduleAI();
  }

  backToMenu(): void {
    save.clearSave();
    this.state = this.freshState(defaultSettings());
    this.emit();
  }

  // ---------------------------------------------------------------- 回合流转
  private startTurn(): void {
    const s = this.state;
    const p = s.players[s.current];
    if (p.godTurns > 0) p.godTurns--;
    if (p.misfortuneTurns > 0) p.misfortuneTurns--;
    s.phase = 'awaitRoll';
    s.lastRoll = null;
    s.pendingBuy = null;
    s.modal = null;
    this.addLog(`—— 第 ${s.round} 轮 · ${p.name}${p.inJail ? '（塔中）' : ''} 的回合 ——`, 'turn');
    if (p.isAI) this.scheduleAI();
  }

  private endTurn(): void {
    const s = this.state;
    if (s.phase === 'gameover') return;
    const active = s.players.filter((p) => !p.bankrupt);
    if (active.length <= 1) {
      this.endGame();
      return;
    }
    const prev = s.current;
    let idx = prev;
    for (let i = 0; i < s.players.length; i++) {
      idx = (idx + 1) % s.players.length;
      if (!s.players[idx].bankrupt) break;
    }
    s.current = idx;
    if (idx <= prev) s.round++;
    if (s.round > s.maxRounds) {
      this.endGame();
      return;
    }
    this.startTurn();
    this.emit();
  }

  private endGame(): void {
    const s = this.state;
    // 帧数上限已到：endTurn 会把 round 自增到 maxRounds + 1，结算时回退，避免顶栏显示「第 11 / 10 轮」
    if (s.round > s.maxRounds) s.round = s.maxRounds;
    const rankings: Ranking[] = s.players
      .map((p) => ({ id: p.id, name: p.name, color: p.color, net: netWorth(s, p), bankrupt: p.bankrupt }))
      .sort((a, b) => b.net - a.net);
    s.rankings = rankings;
    s.phase = 'gameover';
    s.modal = null;
    this.addLog(`对局结束！冠军：${rankings[0].name}`, 'turn');
    save.clearSave();
    this.emit();
  }

  // ---------------------------------------------------------------- 骰子与移动
  roll = async (): Promise<void> => {
    const s = this.state;
    if (this.busy || s.phase !== 'awaitRoll') return;
    const p = s.players[s.current];
    this.busy = true;
    try {
      const a = 1 + Math.floor(Math.random() * 6);
      const b = 1 + Math.floor(Math.random() * 6);
      s.lastRoll = [a, b];
      s.phase = 'rolling';
      this.addLog(`${p.name} 掷出 ${a} + ${b} = ${a + b} 点`, 'info');
      this.emit();
      await this.hooks.dice?.(a, b);
      if (p.inJail) {
        if (a === b) {
          p.inJail = false;
          p.jailTurns = 0;
          this.addLog(`${p.name} 掷出双同点，破禁而出！`, 'event');
          await this.moveAndResolve(p, a + b);
        } else {
          p.jailTurns++;
          if (p.jailTurns >= JAIL_MAX_TURNS) {
            p.inJail = false;
            p.jailTurns = 0;
            this.addLog(`${p.name} 禁期已满，脱困而出`, 'event');
            await this.moveAndResolve(p, a + b);
          } else {
            this.addLog(`${p.name} 未掷出同点，继续受困（${p.jailTurns}/${JAIL_MAX_TURNS}）`, 'event');
            this.endTurn();
          }
        }
      } else {
        await this.moveAndResolve(p, a + b);
      }
    } finally {
      this.busy = false;
      this.emit();
    }
  };

  private async moveAndResolve(p: Player, steps: number): Promise<void> {
    const s = this.state;
    s.phase = 'moving';
    this.emit();
    const from = p.pos;
    const to = (from + steps) % TILES.length;
    const path: number[] = [];
    for (let i = 1; i <= steps; i++) path.push((from + i) % TILES.length);
    await this.hooks.move?.(p.id, path);
    p.pos = to;
    if (from + steps >= TILES.length) {
      const amt = SALARY + (p.godTurns > 0 ? GOD_SALARY_BONUS : 0);
      p.cash += amt;
      this.float(p.id, amt, START_TILE);
      this.addLog(`${p.name} 经过登仙台，领取俸禄 ${amt} 元${p.godTurns > 0 ? '（含仙缘加成）' : ''}`, 'money');
    }
    this.emit();
    await this.resolveTile(p, to);
    if ((s.phase as string) === 'gameover') return;
    if (p.bankrupt) {
      this.endTurn();
      return;
    }
    if (this.extraRoll) {
      this.extraRoll = false;
      s.phase = 'awaitRoll';
      this.emit();
      this.addLog(`${p.name} 踏入传送阵，可以再掷一次！`, 'event');
      if (p.isAI) this.scheduleAI();
      return;
    }
    if ((s.phase as string) === 'moving') {
      s.phase = 'awaitAction';
      this.emit();
    }
  }

  private async resolveTile(p: Player, tile: number): Promise<void> {
    const s = this.state;
    const def = TILES[tile];
    switch (def.type) {
      case 'city': {
        const ts = s.tiles[tile];
        if (ts.owner === null) {
          s.pendingBuy = { tile, price: priceOf(tile) };
          s.phase = 'awaitBuy';
          this.emit();
          return;
        }
        if (ts.owner === p.id || ts.mortgaged) {
          if (ts.mortgaged) this.addLog(`${def.name} 已抵押，无需支付过路费`, 'info');
          else this.addLog(`${def.name} 是 ${p.name} 自己的地盘`, 'info');
          return;
        }
        await this.payRent(p, tile);
        return;
      }
      case 'railway': {
        let take: boolean;
        if (p.isAI) {
          take = ai.aiDecideRailway(p);
        } else {
          take =
            (await this.askChoice({
              type: 'railway',
              icon: '🌀',
              title: '传送阵',
              tone: 'neutral',
              lines: [`消耗 ${RAILWAY_FARE} 元启动传送阵，立即再掷一次？`, '（选择“跳过”则原地停留）']
            })) === 'ok';
        }
        if (take && p.cash >= RAILWAY_FARE) {
          p.cash -= RAILWAY_FARE;
          this.float(p.id, -RAILWAY_FARE, tile);
          this.extraRoll = true;
          this.addLog(`${p.name} 支付 ${RAILWAY_FARE} 元启动传送阵`, 'money');
        }
        return;
      }
      case 'tax': {
        const amt = maintenanceCost(s, p);
        p.cash -= amt;
        this.float(p.id, -amt, tile);
        this.addLog(`${p.name} 缴纳灵脉税 ${amt} 元`, 'money');
        await this.askChoice({
          type: 'event',
          icon: '🛠️',
          title: '灵脉税',
          tone: 'bad',
          lines: [`名下产业共计灵脉税 ${amt} 元（每栋建筑 250 元，最低 500 元）。`]
        });
        await this.settle(p);
        return;
      }
      case 'event': {
        const ev = pickEvent();
        const ctx = this.eventCtx();
        const lines = ev.apply(ctx, p);
        this.addLog(`随机事件【${ev.title}】：${lines[0]}`, 'event');
        this.emit();
        await this.askChoice({ type: 'event', icon: ev.icon, title: ev.title, tone: ev.tone, lines });
        await this.settle(p);
        return;
      }
      case 'god': {
        p.godTurns = GOD_TURNS;
        p.cash += GOD_EVENT_BONUS;
        this.float(p.id, GOD_EVENT_BONUS, tile);
        this.addLog(`${p.name} 获得仙缘加身！`, 'event');
        await this.askChoice({
          type: 'event',
          icon: '🧧',
          title: '仙缘降临',
          tone: 'good',
          lines: [
            `即时奖励 ${GOD_EVENT_BONUS} 元！`,
            `${GOD_TURNS} 回合财运：收租 +50%，经过登仙台额外 +${GOD_SALARY_BONUS} 元`
          ]
        });
        return;
      }
      case 'misfortune': {
        p.misfortuneTurns = MISFORTUNE_TURNS;
        p.cash -= MISFORTUNE_HIT;
        this.float(p.id, -MISFORTUNE_HIT, tile);
        this.addLog(`${p.name} 心魔缠身……`, 'event');
        await this.askChoice({
          type: 'event',
          icon: '🦂',
          title: '心魔缠身',
          tone: 'bad',
          lines: [`即时损失 ${MISFORTUNE_HIT} 元！`, `${MISFORTUNE_TURNS} 回合内支付过路费 +50%`]
        });
        await this.settle(p);
        return;
      }
      case 'gotojail': {
        this.sendToJail(p);
        await this.askChoice({
          type: 'event',
          icon: '⛓️',
          title: '堕魔渊',
          tone: 'bad',
          lines: [`${p.name} 被押入镇妖塔！`, '可支付赎身费、掷出同点或受困满 3 回合脱身']
        });
        return;
      }
      default:
        return;
    }
  }

  private async payRent(p: Player, tile: number): Promise<void> {
    const s = this.state;
    const ts = s.tiles[tile];
    const owner = s.players[ts.owner!];
    const monopoly = hasMonopoly(s, owner.id, TILES[tile].city!.region);
    const rent = computeRent(priceOf(tile), ts.level, owner, p, monopoly);
    p.cash -= rent;
    owner.cash += rent;
    this.float(p.id, -rent, tile);
    this.float(owner.id, rent, tile);
    const notes = [
      monopoly ? '（宗门联动 ×2）' : '',
      owner.godTurns > 0 ? '（仙缘 +50%）' : '',
      p.misfortuneTurns > 0 ? '（心魔 +50%）' : ''
    ]
      .filter(Boolean)
      .join('');
    this.addLog(`${p.name} 途经 ${TILES[tile].name}，支付过路费 ${rent} 元给 ${owner.name}${notes}`, 'money');
    this.emit();
    await this.settle(p, owner.id);
  }

  // ---------------------------------------------------------------- 资金与破产
  private eventCtx(): EventCtx {
    return {
      state: this.state,
      gain: (p, amount, tile) => {
        p.cash += amount;
        this.float(p.id, amount, tile);
        this.emit();
      },
      pay: (p, amount, tile) => {
        p.cash -= amount;
        this.float(p.id, -amount, tile);
        this.emit();
      },
      addLog: (text, kind) => this.addLog(text, kind),
      teleport: (p, to) => {
        p.pos = to;
        this.hooks.move?.(p.id, [to]);
      },
      sendToJail: (p) => this.sendToJail(p),
      float: (pid, amount, tile) => this.float(pid, amount, tile)
    };
  }

  private sendToJail(p: Player): void {
    p.pos = JAIL_TILE;
    p.inJail = true;
    p.jailTurns = 0;
    this.hooks.move?.(p.id, [JAIL_TILE]);
    this.addLog(`${p.name} 被押入镇妖塔`, 'event');
    this.emit();
  }

  /** 处理负债：AI 自动清算，真人进入 awaitDebt 阶段等待处置 */
  private async settle(p: Player, creditorId?: number): Promise<void> {
    if (p.cash >= 0) return;
    if (p.isAI || this.env === 'node') {
      const acts = ai.aiLiquidateActions(this.state, p);
      for (const a of acts) {
        this.addLog(
          `${p.name} 被迫${a.kind === 'sell' ? '卖出建筑' : '抵押地产'}：${TILES[a.tile].name}`,
          'money'
        );
      }
      this.emit();
      if (p.cash < 0) await this.doBankrupt(p, creditorId);
      return;
    }
    this.state.debt = { amount: -p.cash };
    this.state.phase = 'awaitDebt';
    this.addLog(`${p.name} 现金不足，必须变卖资产清偿 ${-p.cash} 元债务！`, 'event');
    this.emit();
    await new Promise<void>((res) => {
      this.debtResolve = res;
    });
  }

  private async doBankrupt(p: Player, creditorId?: number): Promise<void> {
    if (creditorId !== undefined) {
      const creditor = this.state.players[creditorId];
      creditor.cash += Math.max(0, p.cash);
    }
    p.cash = 0;
    p.bankrupt = true;
    this.state.tiles.forEach((ts) => {
      if (ts.owner === p.id) {
        ts.owner = null;
        ts.level = 0;
        ts.mortgaged = false;
      }
    });
    this.state.debt = null;
    this.addLog(`💥 ${p.name} 宣告破产！名下地产全部回收`, 'event');
    this.emit();
  }

  // ---------------------------------------------------------------- 弹窗
  private askChoice(modal: ChoiceModal): Promise<'ok' | 'skip'> {
    const p = this.state.players[this.state.current];
    if (this.env === 'node') return Promise.resolve('ok');
    return new Promise((res) => {
      this.modalResolve = (choice) => res(choice);
      this.state.modal = modal;
      this.emit();
      if (p.isAI) {
        // AI 的事件弹窗短暂展示后自动继续，保证观感
        setTimeout(() => {
          if (this.modalResolve) {
            const r = this.modalResolve;
            this.modalResolve = null;
            this.state.modal = null;
            r('ok');
            this.emit();
          }
        }, 1300);
      }
    });
  }

  ackModal = (choice: 'ok' | 'skip'): void => {
    const r = this.modalResolve;
    this.modalResolve = null;
    this.state.modal = null;
    this.emit();
    r?.(choice);
  };

  // ---------------------------------------------------------------- 公开操作（真人）
  private humanTurn(): boolean {
    const s = this.state;
    return !s.players[s.current].isAI;
  }

  bailOut = (): void => {
    const s = this.state;
    if (this.busy || s.phase !== 'awaitRoll' || !this.humanTurn()) return;
    const p = s.players[s.current];
    if (!p.inJail || p.cash < BAIL) return;
    p.cash -= BAIL;
    p.inJail = false;
    p.jailTurns = 0;
    this.float(p.id, -BAIL);
    this.addLog(`${p.name} 支付赎身费 ${BAIL} 元脱困`, 'money');
    this.emit();
  };

  buyProperty = (): void => {
    const s = this.state;
    if (this.busy || s.phase !== 'awaitBuy' || !this.humanTurn() || !s.pendingBuy) return;
    this.applyBuy();
  };

  skipBuy = (): void => {
    const s = this.state;
    if (this.busy || s.phase !== 'awaitBuy' || !this.humanTurn()) return;
    s.pendingBuy = null;
    s.phase = 'awaitAction';
    this.addLog(`${s.players[s.current].name} 放弃购买`, 'info');
    this.emit();
  };

  private applyBuy(): void {
    const s = this.state;
    const buy = s.pendingBuy!;
    const p = s.players[s.current];
    if (p.cash < buy.price) return;
    p.cash -= buy.price;
    s.tiles[buy.tile].owner = p.id;
    this.float(p.id, -buy.price, buy.tile);
    this.addLog(`${p.name} 以 ${buy.price} 元购入 ${TILES[buy.tile].name}`, 'money');
    s.pendingBuy = null;
    s.phase = 'awaitAction';
    this.emit();
  }

  private canManage(): boolean {
    const s = this.state;
    if (this.busy || s.modal) return false;
    if (s.phase !== 'awaitAction' && s.phase !== 'awaitDebt') return false;
    return this.humanTurn();
  }

  upgradeTile = async (tile: number): Promise<void> => {
    const s = this.state;
    if (!this.canManage()) return;
    const p = s.players[s.current];
    const ts = s.tiles[tile];
    if (ts.owner !== p.id || ts.mortgaged || ts.level >= 3) return;
    const cost = upgradeCost(priceOf(tile));
    if (p.cash < cost) return;
    p.cash -= cost;
    ts.level += 1;
    this.float(p.id, -cost, tile);
    this.addLog(`${p.name} 将 ${TILES[tile].name} 升级为「${BUILDING_NAMES[ts.level]}」（-${cost} 元）`, 'build');
    this.emit();
    this.busy = true;
    try {
      await this.hooks.build?.(tile, ts.level);
    } finally {
      this.busy = false;
    }
    this.afterManage();
  };

  sellBuildingTile = (tile: number): void => {
    const s = this.state;
    if (!this.canManage()) return;
    const p = s.players[s.current];
    const ts = s.tiles[tile];
    if (ts.owner !== p.id || ts.level <= 0) return;
    const refund = sellBuildingRefund(tile);
    ts.level -= 1;
    p.cash += refund;
    this.float(p.id, refund, tile);
    this.addLog(`${p.name} 拆除 ${TILES[tile].name} 一层建筑，回收 ${refund} 元`, 'money');
    this.afterManage();
  };

  mortgageTile = (tile: number): void => {
    const s = this.state;
    if (!this.canManage()) return;
    const p = s.players[s.current];
    const ts = s.tiles[tile];
    if (ts.owner !== p.id || ts.mortgaged || ts.level > 0) return;
    const val = mortgageValue(tile);
    ts.mortgaged = true;
    p.cash += val;
    this.float(p.id, val, tile);
    this.addLog(`${p.name} 抵押 ${TILES[tile].name}，获得 ${val} 元`, 'money');
    this.afterManage();
  };

  redeemTile = (tile: number): void => {
    const s = this.state;
    if (!this.canManage()) return;
    const p = s.players[s.current];
    const ts = s.tiles[tile];
    if (ts.owner !== p.id || !ts.mortgaged) return;
    const cost = redeemCost(tile);
    if (p.cash < cost) return;
    ts.mortgaged = false;
    p.cash -= cost;
    this.float(p.id, -cost, tile);
    this.addLog(`${p.name} 赎回 ${TILES[tile].name}（-${cost} 元）`, 'money');
    this.afterManage();
  };

  private afterManage(): void {
    const s = this.state;
    if (s.phase === 'awaitDebt') {
      const p = s.players[s.current];
      if (p.cash >= 0) {
        s.debt = null;
        s.phase = 'awaitAction';
        this.addLog(`${p.name} 已清偿全部债务`, 'event');
        const r = this.debtResolve;
        this.debtResolve = null;
        r?.();
      } else {
        s.debt = { amount: -p.cash };
      }
    }
    this.emit();
  }

  declareBankruptcy = (): void => {
    const s = this.state;
    if (s.phase !== 'awaitDebt' || !this.humanTurn()) return;
    const p = s.players[s.current];
    this.busy = true;
    void this.doBankrupt(p).then(() => {
      this.busy = false;
      const r = this.debtResolve;
      this.debtResolve = null;
      r?.();
      this.endTurn();
    });
  };

  endTurnManual = (): void => {
    const s = this.state;
    if (this.busy || s.phase !== 'awaitAction' || !this.humanTurn() || s.modal) return;
    this.addLog(`${s.players[s.current].name} 结束回合`, 'turn');
    this.endTurn();
  };

  // ---------------------------------------------------------------- AI 驱动
  private scheduleAI(): void {
    if (this.env === 'node') {
      void this.aiDrive();
      return;
    }
    setTimeout(() => void this.aiDrive(), 350);
  }

  private async aiDrive(): Promise<void> {
    if (this.aiDriving) return;
    this.aiDriving = true;
    try {
      await this.aiDriveInner();
    } catch (err) {
      console.error('[aiDrive] 异常:', err);
    } finally {
      this.aiDriving = false;
    }
  }

  private async aiDriveInner(): Promise<void> {
    {
      // 浏览器中每次驱动只处理一个 AI 回合；node 仿真中单次驱动整局
      const maxSteps = this.env === 'node' ? 1000000 : 80;
      let guard = 0;
      while (guard++ < maxSteps) {
        const s = this.state;
        if (s.phase === 'gameover' || s.phase === 'idle') break;
        const p = s.players[s.current];
        if (!p.isAI) break;
        await this.sleep(ai.aiThinkMs(p) * (0.8 + Math.random() * 0.4));
        if (s.phase === 'awaitRoll') {
          if (p.inJail && ai.aiDecideBail(p)) {
            this.bailOutInternal();
            await this.sleep(450);
            continue;
          }
          await this.roll();
          continue;
        }
        if (s.phase === 'awaitBuy' && s.pendingBuy) {
          if (ai.aiDecideBuy(s, p, s.pendingBuy.tile)) this.applyBuyInternal();
          else {
            s.pendingBuy = null;
            s.phase = 'awaitAction';
            this.addLog(`${p.name} 放弃购买`, 'info');
            this.emit();
          }
          await this.sleep(450);
          continue;
        }
        if (s.phase === 'awaitDebt') break; // AI 负债已在 settle 内自动处理
        if (s.phase === 'awaitAction') {
          const acts = ai.aiPlanActions(s, p);
          for (const a of acts) {
            if (a.kind === 'upgrade') await this.upgradeTileInternal(a.tile);
            else await this.redeemTileInternal(a.tile);
            await this.sleep(420);
          }
          await this.sleep(520);
          this.addLog(`${p.name} 结束回合`, 'turn');
          this.endTurn();
          // node 仿真环境下由当前循环直接驱动下一位 AI；浏览器环境下交给定时器
          if (this.env === 'node') continue;
          break;
        }
        break;
      }
    }
  }

  private bailOutInternal(): void {
    const s = this.state;
    const p = s.players[s.current];
    if (s.phase !== 'awaitRoll' || !p.inJail || p.cash < BAIL) return;
    p.cash -= BAIL;
    p.inJail = false;
    p.jailTurns = 0;
    this.float(p.id, -BAIL);
    this.addLog(`${p.name} 支付赎身费 ${BAIL} 元脱困`, 'money');
    this.emit();
  }

  private applyBuyInternal(): void {
    const s = this.state;
    if (s.phase !== 'awaitBuy' || !s.pendingBuy) return;
    this.applyBuy();
  }

  private async upgradeTileInternal(tile: number): Promise<void> {
    const s = this.state;
    const p = s.players[s.current];
    const ts = s.tiles[tile];
    if (s.phase !== 'awaitAction' || ts.owner !== p.id || ts.mortgaged || ts.level >= 3) return;
    const cost = upgradeCost(priceOf(tile));
    if (p.cash < cost) return;
    p.cash -= cost;
    ts.level += 1;
    this.float(p.id, -cost, tile);
    this.addLog(`${p.name} 将 ${TILES[tile].name} 升级为「${BUILDING_NAMES[ts.level]}」（-${cost} 元）`, 'build');
    this.emit();
    await this.hooks.build?.(tile, ts.level);
  }

  private redeemTileInternal(tile: number): void {
    const s = this.state;
    const p = s.players[s.current];
    const ts = s.tiles[tile];
    if (s.phase !== 'awaitAction' || ts.owner !== p.id || !ts.mortgaged) return;
    const cost = redeemCost(tile);
    if (p.cash < cost) return;
    ts.mortgaged = false;
    p.cash -= cost;
    this.float(p.id, -cost, tile);
    this.addLog(`${p.name} 赎回 ${TILES[tile].name}（-${cost} 元）`, 'money');
    this.emit();
  }

  // ---------------------------------------------------------------- UI 辅助
  ownedListOf(pid: number): number[] {
    return ownedTiles(this.state, pid);
  }
}
