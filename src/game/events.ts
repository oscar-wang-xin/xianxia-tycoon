import { JAIL_TILE, START_TILE } from './board';
import { GOD_TURNS, MISFORTUNE_TURNS, upgradeCost, priceOf } from './rules';
import { TILES } from './board';
import type { GameState, Player } from './types';

export interface EventCtx {
  state: GameState;
  gain(p: Player, amount: number, tile?: number): void;
  pay(p: Player, amount: number, tile?: number): void;
  addLog(text: string, kind: 'info' | 'money' | 'event' | 'build' | 'turn'): void;
  teleport(p: Player, to: number): void;
  sendToJail(p: Player): void;
  float(pid: number, amount: number, tile?: number): void;
}

export interface EventDef {
  id: string;
  icon: string;
  title: string;
  tone: 'good' | 'bad' | 'neutral';
  apply(ctx: EventCtx, p: Player): string[];
}

const yuan = (n: number) => `¥${n.toLocaleString('zh-CN')}`;

export const EVENTS: EventDef[] = [
  {
    id: 'find',
    icon: '💰',
    title: '拾玉不昧',
    tone: 'good',
    apply(ctx, p) {
      ctx.gain(p, 800);
      return [`你拾得一枚无主灵玉并归还原主，获赠 ${yuan(800)}。`];
    }
  },
  {
    id: 'biz',
    icon: '🧧',
    title: '坊市兴隆',
    tone: 'good',
    apply(ctx, p) {
      ctx.gain(p, 1200);
      return [`名下坊市香客如潮，净赚 ${yuan(1200)}。`];
    }
  },
  {
    id: 'taxback',
    icon: '🏦',
    title: '仙盟返还',
    tone: 'good',
    apply(ctx, p) {
      ctx.gain(p, 1500);
      return [`仙盟普惠众修，返还灵石 ${yuan(1500)}。`];
    }
  },
  {
    id: 'newyear',
    icon: '🎇',
    title: '仙长赐福',
    tone: 'good',
    apply(ctx, p) {
      ctx.gain(p, 2000);
      return [`仙长赐下福袋，进账 ${yuan(2000)}！`];
    }
  },
  {
    id: 'repair',
    icon: '🔧',
    title: '法器损毁',
    tone: 'bad',
    apply(ctx, p) {
      ctx.pay(p, 900);
      return [`镇守法器年久失修，支付修缮费 ${yuan(900)}。`];
    }
  },
  {
    id: 'fine',
    icon: '🚦',
    title: '触犯戒律',
    tone: 'bad',
    apply(ctx, p) {
      ctx.pay(p, 1200);
      return [`触犯门规被执事记名，缴纳罚金 ${yuan(1200)}。`];
    }
  },
  {
    id: 'typhoon',
    icon: '🌪️',
    title: '天劫余波',
    tone: 'bad',
    apply(ctx, p) {
      ctx.pay(p, 1500);
      return [`天劫余波震碎洞府禁制，损失 ${yuan(1500)}。`];
    }
  },
  {
    id: 'gotostart',
    icon: '🧭',
    title: '仙鹤引路',
    tone: 'neutral',
    apply(ctx, p) {
      ctx.teleport(p, START_TILE);
      ctx.gain(p, 2000, START_TILE);
      return [`仙鹤载你直达登仙台，领取俸禄 ${yuan(2000)}。`];
    }
  },
  {
    id: 'godmini',
    icon: '🧧',
    title: '仙缘加身',
    tone: 'good',
    apply(ctx, p) {
      ctx.gain(p, 1000);
      p.godTurns = GOD_TURNS;
      return [`仙缘加身：即时 ${yuan(1000)}，且 ${GOD_TURNS} 回合财运亨通！`];
    }
  },
  {
    id: 'misfortune_mini',
    icon: '🦂',
    title: '心魔滋生',
    tone: 'bad',
    apply(ctx, p) {
      ctx.pay(p, 800);
      p.misfortuneTurns = MISFORTUNE_TURNS;
      return [`心魔滋生：损失 ${yuan(800)}，${MISFORTUNE_TURNS} 回合诸事不顺！`];
    }
  },
  {
    id: 'jail',
    icon: '⛓️',
    title: '堕入禁地',
    tone: 'bad',
    apply(ctx, p) {
      ctx.sendToJail(p);
      return [`心魔失控，被押入镇妖塔（第 ${JAIL_TILE} 格）。`];
    }
  },
  {
    id: 'dividend',
    icon: '🤝',
    title: '道友馈赠',
    tone: 'good',
    apply(ctx, p) {
      let total = 0;
      for (const other of ctx.state.players) {
        if (other.id === p.id || other.bankrupt) continue;
        const amt = Math.min(500, Math.max(0, other.cash));
        if (amt > 0) {
          other.cash -= amt;
          total += amt;
          ctx.float(other.id, -amt);
        }
      }
      p.cash += total;
      ctx.float(p.id, total);
      return [`道友仗义馈赠，共收 ${yuan(total)}。`];
    }
  },
  {
    id: 'infra',
    icon: '🚧',
    title: '仙盟摊派',
    tone: 'bad',
    apply(ctx, p) {
      let total = 0;
      for (const other of ctx.state.players) {
        if (other.id === p.id || other.bankrupt) continue;
        const amt = Math.min(400, Math.max(0, p.cash - total));
        if (amt > 0) {
          other.cash += amt;
          total += amt;
          ctx.float(other.id, amt);
        }
      }
      p.cash -= total;
      ctx.float(p.id, -total);
      return [`仙盟共修护山大阵，共摊派 ${yuan(total)}。`];
    }
  },
  {
    id: 'freeupgrade',
    icon: '🏗️',
    title: '顿悟',
    tone: 'good',
    apply(ctx, p) {
      const candidates = ctx.state.tiles
        .map((ts, i) => ({ ts, i }))
        .filter(({ ts, i }) => ts.owner === p.id && !ts.mortgaged && ts.level < 3);
      if (candidates.length === 0) {
        ctx.gain(p, 1000);
        return [`没有可晋升的产业，改为补贴 ${yuan(1000)}。`];
      }
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      pick.ts.level += 1;
      const name = TILES[pick.i].name;
      ctx.addLog(`顿悟：${name} 晋升至 ${pick.ts.level} 级`, 'build');
      return [`${name} 顿悟晋升（省下 ${yuan(upgradeCost(priceOf(pick.i)))}）！`];
    }
  }
];

export function pickEvent(): EventDef {
  return EVENTS[Math.floor(Math.random() * EVENTS.length)];
}
