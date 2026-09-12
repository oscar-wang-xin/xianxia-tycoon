/** 游戏核心类型定义（引擎与渲染、UI 完全分层） */

export type RegionId = 'qingyun' | 'wanjian' | 'tianji' | 'penglai' | 'youming' | 'wanyao' | 'danxia' | 'kunlun';

export interface RegionDef {
  id: RegionId;
  name: string;
  color: string;
}

export interface CityDef {
  name: string;
  region: RegionId;
  price: number;
}

export type TileType =
  | 'start'
  | 'city'
  | 'railway'
  | 'park'
  | 'event'
  | 'tax'
  | 'jail'
  | 'gotojail'
  | 'god'
  | 'misfortune';

export interface TileDef {
  index: number;
  type: TileType;
  name: string;
  city?: CityDef;
}

export interface TileState {
  owner: number | null;
  level: number; // 0 洞府 1 楼阁 2 殿宇 3 仙宫
  mortgaged: boolean;
}

export type AIDifficulty = 'easy' | 'normal' | 'hard';

export interface Player {
  id: number;
  name: string;
  color: string;
  isAI: boolean;
  difficulty: AIDifficulty;
  cash: number;
  pos: number;
  inJail: boolean;
  jailTurns: number;
  godTurns: number; // 仙缘 buff 剩余回合
  misfortuneTurns: number; // 心魔 debuff 剩余回合
  bankrupt: boolean;
}

export interface SeatConfig {
  isAI: boolean;
  name: string;
  difficulty: AIDifficulty;
}

export interface GameSettings {
  seats: SeatConfig[];
  startCash: number;
  maxRounds: number;
}

export type Phase =
  | 'idle'
  | 'awaitRoll'
  | 'rolling'
  | 'moving'
  | 'awaitBuy'
  | 'awaitAction'
  | 'awaitDebt'
  | 'gameover';

export interface LogEntry {
  id: number;
  round: number;
  text: string;
  kind: 'info' | 'money' | 'event' | 'build' | 'turn';
}

export interface ChoiceModal {
  type: 'event' | 'railway';
  icon: string;
  title: string;
  lines: string[];
  tone: 'good' | 'bad' | 'neutral';
}

export interface Ranking {
  id: number;
  name: string;
  color: string;
  net: number;
  bankrupt: boolean;
}

export interface GameState {
  phase: Phase;
  players: Player[];
  current: number;
  round: number;
  maxRounds: number;
  startCash: number;
  tiles: TileState[];
  log: LogEntry[];
  pendingBuy: { tile: number; price: number } | null;
  debt: { amount: number } | null;
  lastRoll: [number, number] | null;
  modal: ChoiceModal | null;
  rankings: Ranking[] | null;
  seatConfigs: SeatConfig[];
}

/** 引擎抛给表现层的动画意图 */
export interface EngineHooks {
  dice?(a: number, b: number): Promise<void>;
  move?(pid: number, path: number[]): Promise<void>;
  build?(tile: number, level: number): Promise<void>;
  money?(pid: number, amount: number, tile?: number): void;
  focus?(tile: number): Promise<void>;
}
