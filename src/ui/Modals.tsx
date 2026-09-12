import type { GameController } from '../game/controller';
import type { GameState } from '../game/types';
import { RAILWAY_FARE } from '../game/rules';
import { sfx } from '../audio/sfx';

/** 事件 / 传送阵选择弹窗 */
export function ChoiceModalView({ state, c }: { state: GameState; c: GameController }) {
  const m = state.modal;
  if (!m) return null;
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-icon">{m.icon}</div>
        <div className={`modal-title ${m.tone}`}>{m.title}</div>
        <div className="modal-lines">
          {m.lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
        <div className="modal-actions">
          {m.type === 'railway' ? (
            <>
              <button className="btn" onClick={() => { sfx.click(); sfx.teleport(); c.ackModal('ok'); }}>
                启动传送阵 ¥{RAILWAY_FARE}
              </button>
              <button className="btn btn-ghost" onClick={() => { sfx.click(); c.ackModal('skip'); }}>
                留在原地
              </button>
            </>
          ) : (
            <button className="btn" onClick={() => { sfx.click(); c.ackModal('ok'); }}>
              继续
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 结算排名面板 */
export function GameOverModal({ state, c }: { state: GameState; c: GameController }) {
  if (state.phase !== 'gameover' || !state.rankings) return null;
  const medals = ['🥇', '🥈', '🥉', '4️⃣'];
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-icon">🏆</div>
        <div className="modal-title good">对局结算</div>
        <div>
          {state.rankings.map((r, i) => (
            <div key={r.id} className={`rank-row${i === 0 ? ' champ' : ''}`}>
              <span className="medal">{medals[i] ?? i + 1}</span>
              <span
                className="who-dot"
                style={{ background: r.color, width: 12, height: 12, borderRadius: '50%' }}
              />
              <span className="rname">
                {r.name}
                {r.bankrupt ? '（破产）' : ''}
              </span>
              <span className="rnet">¥{r.net.toLocaleString('zh-CN')}</span>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button
            className="btn"
            onClick={() =>
              c.newGame({
                seats: state.seatConfigs,
                startCash: state.startCash,
                maxRounds: state.maxRounds
              })
            }
          >
            再来一局
          </button>
          <button className="btn btn-ghost" onClick={() => { sfx.click(); c.backToMenu(); }}>
            返回菜单
          </button>
        </div>
      </div>
    </div>
  );
}
