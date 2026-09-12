import { TILES, regionOf, TILE_STYLE } from '../game/board';
import type { GameController } from '../game/controller';
import {
  BUILDING_NAMES,
  displayRent,
  mortgageValue,
  priceOf,
  redeemCost,
  sellBuildingRefund,
  upgradeCost
} from '../game/rules';
import type { GameState } from '../game/types';

/** 地块详情弹窗：完整地名、势力、售价、归属、建筑等级、地脉品阶；轮到真人时可就地经营 */
export function PropertyModal({
  tile,
  state,
  c,
  onClose
}: {
  tile: number;
  state: GameState;
  c: GameController;
  onClose: () => void;
}) {
  const def = TILES[tile];
  const ts = state.tiles[tile];
  const isCity = def.type === 'city';
  const owner = ts.owner !== null ? state.players[ts.owner] : null;
  const cur = state.players[state.current];
  const price = priceOf(tile);
  // 窄屏下右侧卡片不展示资产面板，这里提供同样的经营入口（升级 / 卖房 / 抵押 / 赎回）
  const canManage =
    isCity &&
    !!owner &&
    !!cur &&
    owner.id === state.current &&
    !cur.isAI &&
    !state.modal &&
    (state.phase === 'awaitAction' || state.phase === 'awaitDebt');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal prop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">{isCity ? '🏔️' : TILE_STYLE[def.type]?.icon ?? '📍'}</div>
        <div className="modal-title">{def.name}</div>
        {isCity ? (
          <>
            <span className="pm-region" style={{ background: regionOf(def.city!.region).color }}>
              {regionOf(def.city!.region).name}
            </span>
            <div className="pm-grid">
              <div className="cell">
                <div className="k">售价</div>
                <div className="v">¥{priceOf(tile).toLocaleString('zh-CN')}</div>
              </div>
              <div className="cell">
                <div className="k">归属</div>
                <div className="v">{owner ? owner.name : '无主'}</div>
              </div>
              <div className="cell">
                <div className="k">建筑等级</div>
                <div className="v">
                  {ts.level > 0 ? `${BUILDING_NAMES[ts.level]}（${'★'.repeat(ts.level)}）` : '空地'}
                  {ts.mortgaged ? ' · 已抵押' : ''}
                </div>
              </div>
              <div className="cell">
                <div className="k">当前过路费</div>
                <div className="v">{owner ? `¥${displayRent(state, tile).toLocaleString('zh-CN')}` : '—'}</div>
              </div>
              <div className="cell">
                <div className="k">地脉品阶</div>
                <div className="v">{tierOf(price)}</div>
              </div>
              <div className="cell">
                <div className="k">灵气强度</div>
                <div className="v">{Math.round(price / 10)} 缕</div>
              </div>
            </div>
            <div className="pm-note">注：地脉品阶与灵气强度为参考值，实际租金以牌面与宗门联动为准。</div>
          </>
        ) : (
          <div className="pm-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="cell">
              <div className="k">地块类型</div>
              <div className="v">{specialName(def.type)}</div>
            </div>
            <div className="cell">
              <div className="k">说明</div>
              <div className="v" style={{ fontSize: 13, fontWeight: 600 }}>{specialDesc(def.type)}</div>
            </div>
          </div>
        )}
        {canManage && (
          <div className="pm-manage">
            {state.phase === 'awaitDebt' && (
              <div className="pm-manage-hint">⚠️ 现金不足，请卖房或抵押地产以清偿债务</div>
            )}
            <div className="pm-manage-row">
              {!ts.mortgaged && ts.level < 3 && (
                <button
                  className="btn btn-primary"
                  disabled={cur.cash < upgradeCost(price)}
                  onClick={() => void c.upgradeTile(tile)}
                >
                  升级为{BUILDING_NAMES[ts.level + 1]} ¥{upgradeCost(price)}
                </button>
              )}
              {!ts.mortgaged && ts.level > 0 && (
                <button className="btn btn-gold" onClick={() => c.sellBuildingTile(tile)}>
                  卖房一层 +¥{sellBuildingRefund(tile)}
                </button>
              )}
              {!ts.mortgaged && ts.level === 0 && (
                <button className="btn btn-gold" onClick={() => c.mortgageTile(tile)}>
                  抵押 +¥{mortgageValue(tile)}
                </button>
              )}
              {ts.mortgaged && (
                <button
                  className="btn btn-gold"
                  disabled={cur.cash < redeemCost(tile)}
                  onClick={() => c.redeemTile(tile)}
                >
                  赎回 ¥{redeemCost(tile)}
                </button>
              )}
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

function specialName(t: string): string {
  const map: Record<string, string> = {
    start: '登仙台',
    railway: '传送阵',
    park: '灵泉',
    event: '机缘',
    tax: '灵脉税',
    jail: '镇妖塔（途经）',
    gotojail: '堕魔渊',
    god: '仙缘',
    misfortune: '心魔'
  };
  return map[t] ?? t;
}

function specialDesc(t: string): string {
  const map: Record<string, string> = {
    start: '经过或停留即可领取俸禄 ¥2,000',
    railway: '消耗 ¥800 启动传送阵，可立即再掷一次',
    park: '灵泉休憩片刻，无任何影响',
    event: '触发 14 种随机机缘之一',
    tax: '按名下产业缴纳灵脉税（每栋 ¥250）',
    jail: '途经镇妖塔，仅是观望',
    gotojail: '立即被押入镇妖塔',
    god: '获得即时奖励 + 3 回合仙缘 buff',
    misfortune: '立即扣款 + 3 回合心魔 debuff'
  };
  return map[t] ?? '';
}

/** 由地价推断地脉品阶（仅作展示参考） */
function tierOf(price: number): string {
  if (price >= 3600) return '天阶灵脉';
  if (price >= 3000) return '地阶灵脉';
  if (price >= 2600) return '玄阶灵脉';
  return '黄阶灵脉';
}
