import type { RegionDef, RegionId, TileDef } from './types';

/** 八大修真势力（区域） */
export const REGIONS: RegionDef[] = [
  { id: 'qingyun', name: '青云剑宗', color: '#2fa36b' },
  { id: 'wanjian', name: '万剑山庄', color: '#3d7bd9' },
  { id: 'tianji', name: '天机阁', color: '#8e5bd0' },
  { id: 'penglai', name: '蓬莱仙岛', color: '#1f9e9e' },
  { id: 'youming', name: '幽冥鬼域', color: '#4a5a8a' },
  { id: 'wanyao', name: '万妖岭', color: '#d84b3a' },
  { id: 'danxia', name: '丹霞药谷', color: '#e8a33d' },
  { id: 'kunlun', name: '昆仑墟', color: '#d4587f' }
];

export function regionOf(id: RegionId): RegionDef {
  return REGIONS.find((r) => r.id === id)!;
}

const city = (name: string, region: RegionId, price: number) => ({ name, region, price });

/** 32 格环形棋盘（角格：0 登仙台 / 8 传送阵 / 16 镇妖塔 / 24 灵泉） */
export const TILES: TileDef[] = [
  { index: 0, type: 'start', name: '登仙台' },
  { index: 1, type: 'city', name: '青云峰', city: city('青云峰', 'qingyun', 3400) },
  { index: 2, type: 'city', name: '通天峰', city: city('通天峰', 'qingyun', 3200) },
  { index: 3, type: 'city', name: '问剑台', city: city('问剑台', 'qingyun', 2800) },
  { index: 4, type: 'event', name: '机缘' },
  { index: 5, type: 'city', name: '剑冢', city: city('剑冢', 'wanjian', 2800) },
  { index: 6, type: 'city', name: '铸剑池', city: city('铸剑池', 'wanjian', 2600) },
  { index: 7, type: 'city', name: '试剑台', city: city('试剑台', 'wanjian', 2400) },
  { index: 8, type: 'railway', name: '传送阵' },
  { index: 9, type: 'city', name: '观星台', city: city('观星台', 'tianji', 3200) },
  { index: 10, type: 'city', name: '藏经楼', city: city('藏经楼', 'tianji', 3000) },
  { index: 11, type: 'city', name: '蓬莱阁', city: city('蓬莱阁', 'penglai', 3800) },
  { index: 12, type: 'city', name: '蟠桃林', city: city('蟠桃林', 'penglai', 3400) },
  { index: 13, type: 'city', name: '瀛洲渡', city: city('瀛洲渡', 'penglai', 3000) },
  { index: 14, type: 'misfortune', name: '心魔' },
  { index: 15, type: 'event', name: '机缘' },
  { index: 16, type: 'jail', name: '镇妖塔' },
  { index: 17, type: 'city', name: '黄泉渡', city: city('黄泉渡', 'youming', 3000) },
  { index: 18, type: 'city', name: '忘川桥', city: city('忘川桥', 'youming', 2800) },
  { index: 19, type: 'event', name: '机缘' },
  { index: 20, type: 'city', name: '妖王殿', city: city('妖王殿', 'wanyao', 3600) },
  { index: 21, type: 'city', name: '狐岐山', city: city('狐岐山', 'wanyao', 3600) },
  { index: 22, type: 'city', name: '黑风寨', city: city('黑风寨', 'wanyao', 3000) },
  { index: 23, type: 'tax', name: '灵脉税' },
  { index: 24, type: 'park', name: '灵泉' },
  { index: 25, type: 'city', name: '万药园', city: city('万药园', 'danxia', 3200) },
  { index: 26, type: 'city', name: '百草涧', city: city('百草涧', 'danxia', 2600) },
  { index: 27, type: 'city', name: '瑶池', city: city('瑶池', 'kunlun', 3000) },
  { index: 28, type: 'city', name: '玉虚峰', city: city('玉虚峰', 'kunlun', 2800) },
  { index: 29, type: 'city', name: '昆仑台', city: city('昆仑台', 'kunlun', 2400) },
  { index: 30, type: 'god', name: '仙缘' },
  { index: 31, type: 'gotojail', name: '堕魔渊' }
];

/** 某势力的全部城池格 */
export function regionCityTiles(region: RegionId): number[] {
  return TILES.filter((t) => t.city && t.city.region === region).map((t) => t.index);
}

/** 特殊格的图标配色 */
export const TILE_STYLE: Record<string, { color: string; icon: string }> = {
  start: { color: '#2fa36b', icon: '仙' },
  railway: { color: '#3d7bd9', icon: '阵' },
  park: { color: '#57b26a', icon: '泉' },
  event: { color: '#8e5bd0', icon: '机' },
  tax: { color: '#b0653a', icon: '税' },
  jail: { color: '#5d6b66', icon: '塔' },
  gotojail: { color: '#d84b3a', icon: '渊' },
  god: { color: '#e8a33d', icon: '福' },
  misfortune: { color: '#4a5a8a', icon: '魔' }
};

export const JAIL_TILE = 16;
export const START_TILE = 0;
