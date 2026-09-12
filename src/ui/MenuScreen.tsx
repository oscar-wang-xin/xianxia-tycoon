import { useState } from 'react';
import { GameController, PLAYER_COLORS } from '../game/controller';
import * as save from '../game/save';
import { aiDifficultyLabel } from '../game/ai';
import { sfx } from '../audio/sfx';
import type { AIDifficulty, GameSettings, SeatConfig } from '../game/types';

const CASH_OPTIONS = [10000, 15000, 20000, 25000];
const ROUND_OPTIONS = [10, 20, 30, 50];

export function MenuScreen({ c }: { c: GameController }) {
  const initial = c.getState().seatConfigs;
  const [count, setCount] = useState(Math.max(2, initial.length));
  const [seats, setSeats] = useState<SeatConfig[]>(() => {
    const base = [...initial];
    while (base.length < 4) base.push({ isAI: true, name: `玩家 ${base.length + 1}`, difficulty: 'normal' });
    return base;
  });
  const [startCash, setStartCash] = useState(15000);
  const [maxRounds, setMaxRounds] = useState(30);
  const [saveExists] = useState(save.hasSave());

  const setSeat = (i: number, patch: Partial<SeatConfig>) => {
    setSeats((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  };

  const start = () => {
    const settings: GameSettings = {
      seats: seats.slice(0, count),
      startCash,
      maxRounds
    };
    sfx.click();
    c.newGame(settings);
  };

  return (
    <div className="menu-wrap">
      <div className="menu-card">
        <div className="menu-logo">
          <div className="logo-badge">仙</div>
          <div>
            <div className="menu-title">仙域大富翁</div>
            <div className="menu-sub">XIANXIA TYCOON · 3D 修仙沙盘棋盘</div>
          </div>
        </div>

        <div className="field-label">玩家人数</div>
        <div className="seg">
          {[2, 3, 4].map((n) => (
            <button key={n} className={count === n ? 'on' : ''} onClick={() => setCount(n)}>
              {n} 人
            </button>
          ))}
        </div>

        <div className="field-label">席位设置（昵称 / 真人或电脑 / 电脑难度）</div>
        {seats.slice(0, count).map((seat, i) => (
          <div className="seat-row" key={i}>
            <span className="seat-dot" style={{ background: PLAYER_COLORS[i] }} />
            <input
              value={seat.name}
              maxLength={8}
              onChange={(e) => setSeat(i, { name: e.target.value })}
              placeholder={`玩家 ${i + 1}`}
            />
            <div className="seg">
              <button className={!seat.isAI ? 'on' : ''} onClick={() => setSeat(i, { isAI: false })}>
                真人
              </button>
              <button className={seat.isAI ? 'on' : ''} onClick={() => setSeat(i, { isAI: true })}>
                电脑
              </button>
            </div>
            {seat.isAI && (
              <select
                value={seat.difficulty}
                onChange={(e) => setSeat(i, { difficulty: e.target.value as AIDifficulty })}
              >
                {(['easy', 'normal', 'hard'] as AIDifficulty[]).map((d) => (
                  <option key={d} value={d}>
                    {aiDifficultyLabel(d)}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}

        <div className="field-label">初始资金</div>
        <div className="seg">
          {CASH_OPTIONS.map((v) => (
            <button key={v} className={startCash === v ? 'on' : ''} onClick={() => setStartCash(v)}>
              ¥{v.toLocaleString('zh-CN')}
            </button>
          ))}
        </div>

        <div className="field-label">对局轮数上限</div>
        <div className="seg">
          {ROUND_OPTIONS.map((v) => (
            <button key={v} className={maxRounds === v ? 'on' : ''} onClick={() => setMaxRounds(v)}>
              {v} 轮
            </button>
          ))}
        </div>

        <div className="menu-actions">
          {saveExists && (
            <button className="btn btn-gold" onClick={() => { sfx.click(); c.continueGame(); }}>
              ⏯️ 继续上次对局
            </button>
          )}
          <button className="btn btn-primary" onClick={start}>
            🎮 开始对局
          </button>
        </div>

        <div className="menu-note">
          规则速览：掷双骰沿 32 格仙途前进，经过登仙台领俸禄；无主城池可购入，他人城池付过路费；
          洞府 → 楼阁 → 殿宇 → 仙宫共 3 次晋升；集齐一域全部城池可激活宗门联动，租金翻倍。
          仙缘 / 心魔持续 3 回合；负债需变卖产业，无法清偿即破产。纯前端运行，对局自动存档于浏览器。
        </div>
      </div>
    </div>
  );
}
