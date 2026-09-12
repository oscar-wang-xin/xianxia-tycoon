import * as THREE from 'three';
import { makeLantern, makeTree } from './models';

/** 棋盘中心的仙家地标建筑群（程序化几何） */

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...opts });
}

function shadowed(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** 问道台：三重蓝瓦圆顶 */
function daoPlatform(): THREE.Group {
  const g = new THREE.Group();
  const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.7, 24), mat(0xd9cdb4)));
  base.position.y = 0.35;
  const wall = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 1.6, 20), mat(0xb8452f)));
  wall.position.y = 1.5;
  const door = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.1), mat(0x5a3a26)));
  door.position.set(0, 1.2, 1.58);
  const roof1 = shadowed(new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.9, 20), mat(0x2f6fb3)));
  roof1.position.y = 2.75;
  const tier2 = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.7, 18), mat(0xb8452f)));
  tier2.position.y = 3.5;
  const roof2 = shadowed(new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.8, 18), mat(0x2f6fb3)));
  roof2.position.y = 4.2;
  const tier3 = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.5, 14), mat(0xb8452f)));
  tier3.position.y = 4.8;
  const roof3 = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.0, 14), mat(0x2f6fb3)));
  roof3.position.y = 5.5;
  const finial = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), mat(0xf0c040, { metalness: 0.5 })));
  finial.position.y = 6.1;
  g.add(base, wall, door, roof1, tier2, roof2, tier3, roof3);
  return g;
}

/** 灵珠塔：串珠高塔 */
function spiritPearlTower(): THREE.Group {
  const g = new THREE.Group();
  const pedestal = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.5, 12), mat(0xc9bda4)));
  pedestal.position.y = 0.25;
  const column = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 4.6, 10), mat(0xcfd6da)));
  column.position.y = 2.8;
  const low = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 12), mat(0xd4587f)));
  low.position.y = 1.6;
  const mid = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 12), mat(0xd4587f)));
  mid.position.y = 3.8;
  const top = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), mat(0xd4587f)));
  top.position.y = 5.5;
  const antenna = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 1.6, 6), mat(0x9aa4aa)));
  antenna.position.y = 6.6;
  g.add(pedestal, column, low, mid, top, antenna);
  return g;
}

/** 玲珑塔：细腰高塔 */
function slimPagoda(): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const r = 0.55 - Math.sin(t * Math.PI) * 0.32 + t * 0.12;
    pts.push(new THREE.Vector2(Math.max(r, 0.1), t * 5.2));
  }
  const body = shadowed(new THREE.Mesh(new THREE.LatheGeometry(pts, 14), mat(0xd8e2e8, { metalness: 0.25 })));
  const mesh1 = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 20), mat(0x3d7bd9, { emissive: 0x3d7bd9, emissiveIntensity: 0.4 })));
  mesh1.rotation.x = Math.PI / 2;
  mesh1.position.y = 1.6;
  const mesh2 = mesh1.clone();
  mesh2.position.y = 3.4;
  const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mat(0x3d7bd9, { emissive: 0x2255aa, emissiveIntensity: 0.4 })));
  head.position.y = 5.45;
  g.add(body, mesh1, mesh2, head);
  return g;
}

/** 中式塔楼（三层飞檐宝塔） */
function pagoda(): THREE.Group {
  const g = new THREE.Group();
  const levels = [
    { w: 1.9, y: 0.9, h: 1.5 },
    { w: 1.5, y: 2.5, h: 1.3 },
    { w: 1.1, y: 3.9, h: 1.1 }
  ];
  for (const l of levels) {
    const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(l.w, l.h, l.w), mat(0xe8d9b8)));
    body.position.y = l.y;
    const eave = shadowed(new THREE.Mesh(new THREE.ConeGeometry(l.w * 0.95, 0.55, 4), mat(0x3f7d4e)));
    eave.rotation.y = Math.PI / 4;
    eave.position.y = l.y + l.h / 2 + 0.26;
    const upturned = shadowed(new THREE.Mesh(new THREE.BoxGeometry(l.w * 1.1, 0.08, l.w * 0.25), mat(0x3f7d4e)));
    upturned.position.set(0, l.y + l.h / 2 + 0.2, l.w * 0.5);
    g.add(body, eave, upturned);
  }
  const finial = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), mat(0xf0c040, { metalness: 0.5 })));
  finial.position.y = 4.85;
  g.add(finial);
  return g;
}

/** 飞檐楼阁（两层） */
function pavilion(): THREE.Group {
  const g = new THREE.Group();
  const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 2.0), mat(0xd9cdb4)));
  base.position.y = 0.2;
  const hall = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.2, 1.5), mat(0xb8452f)));
  hall.position.y = 1.0;
  const pillars = mat(0x8a3a26);
  for (const [px, pz] of [
    [0.85, 0.65],
    [-0.85, 0.65],
    [0.85, -0.65],
    [-0.85, -0.65]
  ]) {
    const col = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 8), pillars));
    col.position.set(px, 1.0, pz);
    g.add(col);
  }
  const roof = shadowed(new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.9, 4), mat(0x2f6fb3)));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.05;
  const ridge = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), mat(0xf0c040)));
  ridge.position.y = 2.55;
  g.add(base, hall, roof, ridge);
  return g;
}

/** 石桥（跨水道） */
function stoneBridge(): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(0xcfc6ae);
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const y = Math.sin(t * Math.PI) * 0.55;
    const step = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.6), stone));
    step.position.set(-1.8 + i * 0.6, 0.1 + y, 0);
    g.add(step);
  }
  for (const s of [-1, 1]) {
    const rail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.08, 0.1), stone));
    rail.position.set(0, 0.85, s * 0.75);
    rail.rotation.z = 0;
    g.add(rail);
  }
  return g;
}

/** 园林置石 */
function rock(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const r = shadowed(new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), mat(0xa8a49a)));
  r.scale.set(1, 0.75, 0.9);
  g.add(r);
  g.scale.setScalar(scale);
  return g;
}

/** 组装中心景观（返回一个整体 Group，坐标以棋盘中心为原点） */
export function buildCenterpiece(): THREE.Group {
  const root = new THREE.Group();

  // 中央平台（草坪）
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(27, 0.5, 27),
    mat(0x9fd483, { roughness: 0.95 })
  );
  platform.receiveShadow = true;
  platform.position.y = 0.1;
  root.add(platform);

  // 十字石板路
  const pathMat = mat(0xe3d9c2);
  for (const rot of [0, Math.PI / 2]) {
    const path = new THREE.Mesh(new THREE.BoxGeometry(27, 0.08, 3.2), pathMat);
    path.rotation.y = rot;
    path.position.y = 0.38;
    path.receiveShadow = true;
    root.add(path);
  }

  // 中央水塘 + 环形水道
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x6fc7d8, roughness: 0.2, metalness: 0.1 });
  const pond = new THREE.Mesh(new THREE.CircleGeometry(4.6, 28), waterMat);
  pond.rotation.x = -Math.PI / 2;
  pond.position.y = 0.42;
  root.add(pond);
  const moat = new THREE.Mesh(new THREE.RingGeometry(10.4, 11.4, 40), waterMat);
  moat.rotation.x = -Math.PI / 2;
  moat.position.y = 0.42;
  root.add(moat);

  // 石桥跨过水塘
  const bridge = stoneBridge();
  bridge.position.set(0, 0.35, 0);
  root.add(bridge);

  // 地标
  const tianTan = daoPlatform();
  tianTan.position.set(-7.5, 0.35, -6.5);
  root.add(tianTan);

  const pearl = spiritPearlTower();
  pearl.position.set(7.5, 0.35, 5.5);
  root.add(pearl);

  const canton = slimPagoda();
  canton.position.set(7.8, 0.35, -6.5);
  root.add(canton);

  const pag = pagoda();
  pag.position.set(-7.8, 0.35, 6.5);
  root.add(pag);

  const pav = pavilion();
  pav.position.set(0, 0.35, -8.6);
  root.add(pav);

  // 红灯笼点缀
  for (const [x, z] of [
    [2.2, 2.2],
    [-2.2, -2.2],
    [9, 0],
    [-9, 0],
    [0, 9]
  ]) {
    const lantern = makeLantern(1.5);
    lantern.position.set(x, 0.35, z);
    root.add(lantern);
  }

  // 园林绿化
  const treeSpots: Array<[number, number, number]> = [
    [-4.5, 7.5, 1.1],
    [4.5, -7.5, 1.0],
    [-9.5, -1.5, 1.2],
    [9.5, 1.5, 1.0],
    [-1.5, 9.5, 0.9],
    [1.5, -9.5, 1.1],
    [5.5, 7.8, 0.9],
    [-5.5, -7.8, 1.0],
    [10.5, -9, 0.85],
    [-10.5, 9, 0.85]
  ];
  for (const [x, z, s] of treeSpots) {
    const tree = makeTree(s);
    tree.position.set(x, 0.35, z);
    root.add(tree);
  }
  for (const [x, z] of [
    [3.4, -3.4],
    [-3.4, 3.4]
  ]) {
    const r = rock(1.1);
    r.position.set(x, 0.5, z);
    root.add(r);
  }

  return root;
}
