import type { SceneEngine } from '../three/SceneEngine';
import type { GameController } from '../game/controller';
import { sfx } from '../audio/sfx';

/** 资金变动飘字：在地块/玩家头顶显示 +/- 金额（收入绿、支出红） */
export function spawnFloater(
  layer: HTMLElement,
  engine: SceneEngine,
  c: GameController,
  pid: number,
  amount: number,
  tile?: number
): void {
  sfx.money(amount);
  const pos = engine.getScreenPos(tile ?? c.getState().players[pid]?.pos ?? 0);
  const el = document.createElement('div');
  el.className = `float-item ${amount >= 0 ? 'plus' : 'minus'}`;
  el.textContent = `${amount >= 0 ? '+' : '-'}¥${Math.abs(amount).toLocaleString('zh-CN')}`;
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}
