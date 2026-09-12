import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { GameController } from '../game/controller';
import { TILES, TILE_STYLE, regionOf } from '../game/board';
import {
  BAIL,
  BUILDING_NAMES,
  mortgageValue,
  priceOf,
  redeemCost,
  displayRent,
  sellBuildingRefund,
  upgradeCost,
  monopolyRegions
} from '../game/rules';
import type { GameState, Player } from '../game/types';
import { SceneEngine } from '../three/SceneEngine';
import { sfx } from '../audio/sfx';
import { DiceRow } from './DiceView';
import { spawnFloater } from './floaters';
import { PropertyModal } from './PropertyModal';
import { ChoiceModalView, GameOverModal } from './Modals';

export function GameScreen({ c }: { c: GameController }) {
  const state = useSyncExternalStore(c.subscribe, c.getState);
  const containerRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SceneEngine | null>(null);
  const [propTile, setPropTile] = useState<number | null>(null);
  const [soundOn, setSoundOn] = useState(sfx.enabled);
  const tipRef = useRef<HTMLDivElement>(null);
  const lastPointer = useRef({ x: 0, y: 0 });
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (hover !== null && tipRef.current) positionTip(tipRef.current, lastPointer.current.x, lastPointer.current.y);
  }, [hover]);

  const onSceneMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    const t = engineRef.current?.pickTile(e.clientX, e.clientY) ?? null;
    if (t !== hover) {
      setHover(t);
      engineRef.current?.setHover(t);
    }
    if (tipRef.current) positionTip(tipRef.current, e.clientX, e.clientY);
  };

  const onSceneLeave = () => {
    setHover(null);
    engineRef.current?.setHover(null);
  };

  useEffect(() => {
    const engine = new SceneEngine(containerRef.current!, (i) => {
      sfx.click();
      setPropTile(i);
    });
    engineRef.current = engine;
    c.hooks = {
      dice: (a, b) => {
        sfx.dice();
        return engine.animateDice(a, b);
      },
      move: (pid, path) => {
        path.forEach((_, i) => setTimeout(() => sfx.step(), i * 240));
        return engine.animateMove(pid, path);
      },
      build: (tile, level) => {
        sfx.build();
        return engine.animateBuild(tile, level);
      },
      money: (pid, amount, tile) => {
        if (floatRef.current) spawnFloater(floatRef.current, engine, c, pid, amount, tile);
      },
      focus: (tile) => engine.focusTile(tile)
    };
    return () => {
      c.hooks = {};
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.syncState(state);
    engineRef.current?.setLastState(state);
  }, [state]);

  // 特殊格 / 终局音效：依据新增日志触发
  const logSeen = useRef(0);
  const overSeen = useRef(false);
  useEffect(() => {
    const fresh = state.log.filter((l) => l.id > logSeen.current);
    if (fresh.length) logSeen.current = fresh[fresh.length - 1].id;
    for (const l of fresh) {
      const t = l.text;
      if (t.includes('仙缘')) sfx.fortune();
      else if (t.includes('心魔')) sfx.curse();
      else if (t.includes('传送阵')) sfx.teleport();
      else if (t.includes('镇妖塔')) sfx.jail();
      else if (t.includes('破产')) sfx.bankrupt();
    }

    if (state.phase === 'gameover' && !overSeen.current) {
      overSeen.current = true;
      sfx.win();
    }
  }, [state]);

  const cur = state.players[state.current];
  const humanTurnNow = !cur?.isAI;
  const managing = humanTurnNow && (state.phase === 'awaitAction' || state.phase === 'awaitDebt') && !state.modal;

  const toggleSound = () => {
    sfx.enabled = !sfx.enabled;
    setSoundOn(sfx.enabled);
    if (sfx.enabled) sfx.click();
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  };

  return (
    <div className="app">
      <div
        className="scene-container"
        ref={containerRef}
        onPointerMove={onSceneMove}
        onPointerLeave={onSceneLeave}
        style={{ cursor: hover !== null ? 'pointer' : 'default' }}
      />

      <div className="float-layer" ref={floatRef} />

      {hover !== null && <TileTip tile={hover} state={state} tipRef={tipRef} />}

      {/* 顶栏 */}
      <div className="topbar">
        <div className="logo">
          <div className="logo-badge">仙</div>
          <div>
            <div className="logo-text">仙域大富翁</div>
            <div className="logo-sub">XIANXIA TYCOON</div>
          </div>
        </div>
        <div className="round-chip">
          <span>第</span>
          <span className="cur">{String(state.round).padStart(2, '0')}</span>
          <span className="max">/ {state.maxRounds} 轮</span>
        </div>
        <div className="topbar-actions">
          <button className="icon-btn" title="重置视角" aria-label="重置视角" onClick={() => void engineRef.current?.resetCamera()}>
            ⟲
          </button>
          <button className="icon-btn" title={soundOn ? '关闭音效' : '开启音效'} aria-label={soundOn ? '关闭音效' : '开启音效'} onClick={toggleSound}>
            {soundOn ? '🔊' : '🔇'}
          </button>
          <button className="icon-btn" title="全屏" aria-label="全屏" onClick={toggleFullscreen}>
            ⛶
          </button>
          <button
            className="icon-btn"
            title="返回菜单"
            aria-label="返回菜单"
            onClick={() => {
              if (window.confirm('确定返回菜单？当前对局将结束。')) c.backToMenu();
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* 右侧玩家资产 */}
      <div className="side-panel">
        {state.players.map((p) => (
          <PlayerCard
            key={p.id}
            p={p}
            state={state}
            managing={managing && p.id === state.current}
            c={c}
          />
        ))}
      </div>

      {/* 右下操作面板 */}
      <div className="action-panel">
        <div className="who">
          <span className="who-avatar" style={{ background: cur?.color }}>{seatInitial(cur?.name)}</span>
          <span className="grow">
            {cur?.name}
            {cur?.isAI ? '（电脑）' : ''}
          </span>
        </div>
        <DiceRow roll={state.lastRoll} />
        <div className="grow" />
        {state.phase === 'awaitRoll' && humanTurnNow && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cur.inJail && (
              <button className="btn btn-gold" disabled={cur.cash < BAIL} onClick={() => { sfx.pay(); c.bailOut(); }}>
                支付赎身费 ¥{BAIL}
              </button>
            )}
            <button className="btn btn-primary" onClick={() => void c.roll()}>
              🎲 掷骰子
            </button>
          </div>
        )}
        {state.phase === 'awaitRoll' && cur?.isAI && <div className="action-hint">🤖 {cur.name} 正在思考…</div>}
        {state.phase === 'rolling' && <div className="action-hint">骰子滚动中…</div>}
        {state.phase === 'moving' && <div className="action-hint">移动中…</div>}
        {state.phase === 'awaitBuy' && state.pendingBuy && (
          <div className="buy-box">
            <div>
              <strong>{TILES[state.pendingBuy.tile].name}</strong>
              <span style={{ color: regionOf(TILES[state.pendingBuy.tile].city!.region).color, fontWeight: 700 }}>
                {' '}
                · {regionOf(TILES[state.pendingBuy.tile].city!.region).name}
              </span>
            </div>
            <div className="price">¥{state.pendingBuy.price.toLocaleString('zh-CN')}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn grow"
                disabled={cur.cash < state.pendingBuy.price}
                onClick={() => { sfx.coin(); c.buyProperty(); }}
              >
                买入
              </button>
              <button className="btn btn-ghost" onClick={() => { sfx.click(); c.skipBuy(); }}>
                跳过
              </button>
            </div>
          </div>
        )}
        {state.phase === 'awaitAction' && humanTurnNow && !state.modal && (
          <>
            <div className="action-hint">点击名下城池或右侧卡片，可升级 / 卖房 / 抵押 / 赎回</div>
            <button className="btn btn-primary" onClick={() => { sfx.turn(); c.endTurnManual(); }}>
              结束回合 →
            </button>
          </>
        )}
        {state.phase === 'awaitAction' && cur?.isAI && <div className="action-hint">🤖 {cur.name} 正在经营…</div>}
        {state.phase === 'awaitDebt' && state.debt && (
          <div className="debt-box">
            <div>⚠️ 现金为负，需清偿 ¥{state.debt.amount.toLocaleString('zh-CN')}</div>
            <div style={{ fontWeight: 600 }}>请在右侧变卖建筑或抵押地产</div>
            <button className="btn btn-danger" onClick={() => c.declareBankruptcy()}>
              宣告破产
            </button>
          </div>
        )}
      </div>

      {/* 左下日志 */}
      <LogPanel state={state} />

      {/* 弹窗 */}
      {propTile !== null && <PropertyModal tile={propTile} state={state} c={c} onClose={() => setPropTile(null)} />}
      <ChoiceModalView state={state} c={c} />
      <GameOverModal state={state} c={c} />
    </div>
  );
}

// ---------------------------------------------------------------- 地块悬停浮层
/** 头像用字：默认「玩家一」等取末位序号，其余取首字 */
function seatInitial(name?: string): string {
  if (!name) return '?';
  return /^玩家[一二三四五六七八九]$/.test(name) ? name.slice(-1) : name.slice(0, 1);
}

/** 依据指针位置摆放浮层，靠近视口边缘时自动翻向 */
function positionTip(el: HTMLElement, x: number, y: number): void {
  const pad = 16;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let left = x + pad;
  let top = y + pad;
  if (left + w > window.innerWidth - 8) left = x - pad - w;
  if (top + h > window.innerHeight - 8) top = y - pad - h;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${Math.max(8, top)}px`;
}

const SPECIAL_HINT: Record<string, string> = {
  start: '停留或经过领取俸禄',
  railway: '启动后可再掷一次',
  park: '灵泉休憩，无影响',
  event: '触发随机机缘',
  tax: '按产业缴纳灵脉税',
  jail: '途经镇妖塔，仅观望',
  gotojail: '立即被押入镇妖塔',
  god: '仙缘加身 3 回合',
  misfortune: '心魔缠身 3 回合'
};

function TileTip({
  tile,
  state,
  tipRef
}: {
  tile: number;
  state: GameState;
  tipRef: RefObject<HTMLDivElement>;
}) {
  const def = TILES[tile];
  const ts = state.tiles[tile];
  const isCity = def.type === 'city';
  const region = isCity ? regionOf(def.city!.region) : null;
  const owner = ts.owner !== null ? state.players[ts.owner] : null;
  const accent = region ? region.color : TILE_STYLE[def.type]?.color ?? '#6b7a70';
  return (
    <div className="tile-tip" ref={tipRef}>
      <div className="tile-tip-head">
        <span className="tile-tip-name">{def.name}</span>
        <span className="tile-tip-tag" style={{ background: accent }}>
          {region ? region.name : '特殊地块'}
        </span>
      </div>
      {isCity ? (
        <>
          <div className="tile-tip-row">
            <span>售价</span>
            <b>¥{priceOf(tile).toLocaleString('zh-CN')}</b>
          </div>
          <div className="tile-tip-row">
            <span>归属</span>
            <b style={{ color: owner && owner.id !== undefined ? owner.color : undefined }}>{owner ? owner.name : '无主'}</b>
          </div>
          <div className="tile-tip-row">
            <span>建筑</span>
            <b>
              {ts.level > 0 ? BUILDING_NAMES[ts.level] : '空地'}
              {ts.mortgaged ? ' · 已抵押' : ''}
            </b>
          </div>
          <div className="tile-tip-row">
            <span>过路费</span>
            <b>{owner ? `¥${displayRent(state, tile).toLocaleString('zh-CN')}` : '—'}</b>
          </div>
        </>
      ) : (
        <div className="tile-tip-row">
          <span>效果</span>
          <b>{SPECIAL_HINT[def.type] ?? '—'}</b>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 玩家卡片
function PlayerCard({
  p,
  state,
  managing,
  c
}: {
  p: Player;
  state: GameState;
  managing: boolean;
  c: GameController;
}) {
  const monopolies = monopolyRegions(state, p.id);
  const props = state.tiles.map((ts, i) => ({ ts, i })).filter(({ ts }) => ts.owner === p.id);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (managing) setExpanded(true);
  }, [managing]);

  return (
    <div className={`pcard${p.id === state.current && state.phase !== 'gameover' ? ' active' : ''}${p.bankrupt ? ' dead' : ''}`} style={{ borderLeftColor: p.color }}>
      <div className="pcard-head">
        <span className="pcard-avatar" style={{ background: p.color }}>{seatInitial(p.name)}</span>
        <span className="pcard-name">{p.name}</span>
        {p.inJail && <span className="tag jail">塔中 {p.jailTurns}/3</span>}
        <span className="tag ai">{p.isAI ? '电脑' : '真人'}</span>
      </div>
      <div className={`pcard-cash${p.cash < 0 ? ' negative' : ''}`}>¥{p.cash.toLocaleString('zh-CN')}</div>
      <div className="pcard-meta">
        <span>地产 {props.length}</span>
        <span>建筑 {props.reduce((n, { ts }) => n + ts.level, 0)}</span>
      </div>
      {(p.godTurns > 0 || p.misfortuneTurns > 0) && (
        <div className="buffs">
          {p.godTurns > 0 && <span className="buff god">🧧 仙缘 {p.godTurns} 回合</span>}
          {p.misfortuneTurns > 0 && <span className="buff mis">🦂 心魔 {p.misfortuneTurns} 回合</span>}
        </div>
      )}
      {monopolies.length > 0 && (
        <div className="monopoly-badge">
          🔗 宗门联动
          {monopolies.map((r) => (
            <span key={r} className="monopoly-dot" style={{ background: regionOf(r).color }} title={regionOf(r).name} />
          ))}
        </div>
      )}
      {managing && props.length > 0 && (
        <div className="pcard-props">
          <button className="mini-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setExpanded(!expanded)}>
            {expanded ? '收起资产 ▲' : '展开资产 ▼'}
          </button>
          {expanded &&
            props.map(({ ts, i }) => {
              const price = priceOf(i);
              return (
                <div key={i} className="prop-row">
                  <div className="pr-top">
                    <span className="region-dot" style={{ background: regionOf(TILES[i].city!.region).color }} />
                    {TILES[i].name}
                    {ts.level > 0 ? ` · ${BUILDING_NAMES[ts.level]}` : ''}
                    {ts.mortgaged && <span className="mort">已抵押</span>}
                    <span className="pr-rent">租 ¥{displayRent(state, i)}</span>
                  </div>
                  <div className="prop-actions">
                    {!ts.mortgaged && ts.level < 3 && (
                      <button
                        className="mini-btn"
                        disabled={p.cash < upgradeCost(price)}
                        onClick={() => void c.upgradeTile(i)}
                      >
                        升级 ¥{upgradeCost(price)}
                      </button>
                    )}
                    {!ts.mortgaged && ts.level > 0 && (
                      <button className="mini-btn" onClick={() => c.sellBuildingTile(i)}>
                        卖房 +¥{sellBuildingRefund(i)}
                      </button>
                    )}
                    {!ts.mortgaged && ts.level === 0 && (
                      <button className="mini-btn" onClick={() => c.mortgageTile(i)}>
                        抵押 +¥{mortgageValue(i)}
                      </button>
                    )}
                    {ts.mortgaged && (
                      <button
                        className="mini-btn"
                        disabled={p.cash < redeemCost(i)}
                        onClick={() => c.redeemTile(i)}
                      >
                        赎回 ¥{redeemCost(i)}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 日志
function LogPanel({ state }: { state: GameState }) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [state.log.length]);
  return (
    <div className="log-panel">
      <div className="log-head">
        <span>📜 回合日志</span>
        <span style={{ fontWeight: 600 }}>第 {state.round} 轮</span>
      </div>
      <div className="log-list" ref={listRef}>
        {state.log.slice(-40).map((l) => (
          <div key={l.id} className={`log-item ${l.kind}`}>
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}
