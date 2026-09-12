import * as THREE from 'three';

/** 通用程序化模型：全部几何体与贴图由代码生成，不依赖任何外部素材 */

let sharedWindowTex: THREE.Texture | null = null;

/** 建筑立面窗户贴图（暖色窗格） */
export function windowTexture(): THREE.Texture {
  if (sharedWindowTex) return sharedWindowTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f3ead6';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const lit = Math.random() > 0.4;
      g.fillStyle = lit ? '#ffd98a' : '#7a8b93';
      g.fillRect(12 + x * 30, 12 + y * 30, 18, 20);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  sharedWindowTex = tex;
  return tex;
}

/**
 * 落地铭牌：贴附在棋盘面上的地块名称（可带副标，如售价）。
 * 返回平躺的平面网格（调用方负责旋转铺平并按边朝向棋盘中心）。
 */
export function makeTileLabel(name: string, colorHex: string, sub?: string): THREE.Mesh {
  const W = 300;
  const H = 110;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';

  // 名称：深色字 + 白色描边，保证在浅色棋面上清晰
  const nameY = sub ? 36 : 48;
  g.font = `bold ${sub ? 48 : 56}px 'Microsoft YaHei', 'PingFang SC', sans-serif`;
  g.strokeStyle = 'rgba(255, 255, 255, 0.96)';
  g.lineWidth = 11;
  g.strokeText(name, W / 2, nameY);
  g.fillStyle = '#2a382f';
  g.fillText(name, W / 2, nameY);

  // 势力色标记条
  const bw = 54;
  const bh = 7;
  const by = sub ? 62 : 82;
  const bx = (W - bw) / 2;
  const r = 3.5;
  g.fillStyle = colorHex;
  g.beginPath();
  g.moveTo(bx + r, by);
  g.arcTo(bx + bw, by, bx + bw, by + bh, r);
  g.arcTo(bx + bw, by + bh, bx, by + bh, r);
  g.arcTo(bx, by + bh, bx, by, r);
  g.arcTo(bx, by, bx + bw, by, r);
  g.closePath();
  g.fill();

  if (sub) {
    g.font = `bold 30px 'Microsoft YaHei', sans-serif`;
    g.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    g.lineWidth = 8;
    g.strokeText(sub, W / 2, 90);
    g.fillStyle = '#5b6b62';
    g.fillText(sub, W / 2, 90);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.1), mat);
  mesh.renderOrder = 5;
  return mesh;
}

/** 中式坡屋顶：四棱锥 */
export function hipRoof(w: number, d: number, h: number, color: number): THREE.Mesh {
  const geo = new THREE.ConeGeometry(1, h, 4);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
  );
  mesh.scale.set(w * 0.72, 1, d * 0.72);
  mesh.rotation.y = Math.PI / 4;
  mesh.castShadow = true;
  return mesh;
}

export interface HouseColors {
  wall: number;
  roof: number;
}

/**
 * 产业建筑：0 洞府 / 1 楼阁 / 2 殿宇 / 3 仙宫
 * 高度、层数、窗户、楼顶细节逐级变化
 */
export function makeHouse(level: number, accent: string): THREE.Group {
  const g = new THREE.Group();
  const accentColor = new THREE.Color(accent);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf5eeda, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xc4553d, roughness: 0.55 });

  if (level === 0) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 1.5), wallMat);
    body.position.y = 0.45;
    body.castShadow = true;
    const roof = hipRoof(2.1, 1.7, 0.7, 0xc4553d);
    roof.position.y = 1.25;
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.6, 0.06),
      new THREE.MeshStandardMaterial({ color: accentColor })
    );
    door.position.set(0, 0.3, 0.78);
    g.add(body, roof, door);
  } else if (level === 1) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.9, 1.4), windowWall());
    body.position.y = 0.95;
    body.castShadow = true;
    const roof = hipRoof(1.9, 1.6, 0.6, 0xc4553d);
    roof.position.y = 2.2;
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 0.12, 1.55),
      new THREE.MeshStandardMaterial({ color: accentColor })
    );
    trim.position.y = 1.95;
    g.add(body, roof, trim);
  } else if (level === 2) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.0, 1.4), windowWall());
    body.position.y = 1.5;
    body.castShadow = true;
    const trim1 = new THREE.Mesh(
      new THREE.BoxGeometry(1.75, 0.14, 1.55),
      new THREE.MeshStandardMaterial({ color: accentColor })
    );
    trim1.position.y = 1.6;
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.35, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x8f9aa0 })
    );
    top.position.y = 3.18;
    const roof = hipRoof(1.5, 1.3, 0.5, 0xc4553d);
    roof.position.y = 3.6;
    g.add(body, trim1, top, roof);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 4.6, 1.5), windowWall());
    body.position.y = 2.3;
    body.castShadow = true;
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(1.68, 0.16, 1.68),
      new THREE.MeshStandardMaterial({ color: accentColor })
    );
    trim.position.y = 2.4;
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.5, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x77828a, metalness: 0.4, roughness: 0.4 })
    );
    crown.position.y = 4.85;
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.1, 1.0, 6),
      new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.35 })
    );
    spire.position.y = 5.6;
    g.add(body, trim, crown, spire);
  }
  return g;

  function windowWall(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ map: windowTexture(), roughness: 0.7 });
  }
}

/** 行道树 / 园林树木 */
export function makeTree(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, 0.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x8a6240, roughness: 0.9 })
  );
  trunk.position.y = 0.3;
  trunk.castShadow = true;
  const leaf = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 7),
    new THREE.MeshStandardMaterial({ color: 0x3f9e4d, roughness: 0.9 })
  );
  leaf.position.y = 0.95;
  leaf.scale.set(1, 1.15, 1);
  leaf.castShadow = true;
  g.add(trunk, leaf);
  g.scale.setScalar(scale);
  return g;
}

/** 红灯笼 */
export function makeLantern(poleH = 1.6): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, poleH, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4a32 })
  );
  pole.position.y = poleH / 2;
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xe03a2a, emissive: 0xd42a1a, emissiveIntensity: 0.55, roughness: 0.4 })
  );
  lamp.position.y = poleH + 0.1;
  lamp.scale.set(1, 0.85, 1);
  const tassel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.06, 0.3, 6),
    new THREE.MeshStandardMaterial({ color: 0xffcf5e })
  );
  tassel.position.y = poleH - 0.2;
  g.add(pole, lamp, tassel);
  return g;
}

/** 立体人形棋子：头、身体、四肢 */
export function makePawn(color: string): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.45 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.6 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 4, 10), mat);
  body.position.y = 0.78;
  body.castShadow = true;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), skin);
  head.position.y = 1.5;
  head.castShadow = true;

  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.32, 10), mat);
  hat.position.y = 1.85;

  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.36, 3, 8), mat);
  armL.position.set(0.36, 0.85, 0);
  armL.rotation.z = 0.5;
  const armR = armL.clone();
  armR.position.x = -0.36;
  armR.rotation.z = -0.5;

  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.3, 3, 8), mat);
  legL.position.set(0.14, 0.22, 0);
  const legR = legL.clone();
  legR.position.x = -0.14;

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.5, 0.12, 14),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
  );
  base.position.y = 0.06;

  g.add(base, legL, legR, body, armL, armR, head, hat);
  return g;
}

/** 3D 骰子：六面点数贴图（+x:3 -x:4 +y:1 -y:6 +z:2 -z:5） */
export function makeDice(): THREE.Mesh {
  const mats: THREE.MeshStandardMaterial[] = [];
  const faceOrder = [3, 4, 1, 6, 2, 5];
  for (const n of faceOrder) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fdfaf3';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#d8cdb8';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 122, 122);
    g.fillStyle = '#222';
    const P = 22;
    const spots: Record<number, [number, number][]> = {
      1: [[64, 64]],
      2: [
        [38, 38],
        [90, 90]
      ],
      3: [
        [34, 34],
        [64, 64],
        [94, 94]
      ],
      4: [
        [38, 38],
        [90, 38],
        [38, 90],
        [90, 90]
      ],
      5: [
        [34, 34],
        [94, 34],
        [64, 64],
        [34, 94],
        [94, 94]
      ],
      6: [
        [38, 30],
        [90, 30],
        [38, 64],
        [90, 64],
        [38, 98],
        [90, 98]
      ]
    };
    for (const [x, y] of spots[n]) {
      g.beginPath();
      g.arc(x, y, P / 2, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    mats.push(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 }));
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), mats);
  mesh.castShadow = true;
  return mesh;
}

/** 某点数朝上时的四元数（配合 makeDice 的面顺序） */
export function faceUpQuaternion(value: number): THREE.Quaternion {
  const q = new THREE.Quaternion();
  switch (value) {
    case 1:
      q.identity();
      break;
    case 6:
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
      break;
    case 2:
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      break;
    case 5:
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      break;
    case 3:
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      break;
    case 4:
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
      break;
  }
  return q;
}
