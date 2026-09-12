import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TILES, TILE_STYLE, regionOf } from '../game/board';
import { priceOf } from '../game/rules';
import type { GameState } from '../game/types';
import {
  faceUpQuaternion,
  makeDice,
  makeHouse,
  makeTileLabel,
  makePawn,
  makeTree
} from './models';
import { buildCenterpiece } from './landmarks';

const TILE_STEP = 4; // 相邻格中心距
const HALF = 16; // 棋盘半径（角格中心）

/** 棋盘格世界坐标（32 格沿正方形周长均匀分布，角格 0/8/16/24） */
export function tilePosition(i: number): THREE.Vector3 {
  const d = (i * TILE_STEP) % (TILE_STEP * 32);
  if (d < 32) return new THREE.Vector3(-HALF + d, 0, HALF);
  if (d < 64) return new THREE.Vector3(HALF, 0, HALF - (d - 32));
  if (d < 96) return new THREE.Vector3(HALF - (d - 64), 0, -HALF);
  return new THREE.Vector3(-HALF, 0, -HALF + (d - 96));
}

/** 格子朝向棋盘中心的方向 */
function inward(i: number): THREE.Vector3 {
  const p = tilePosition(i);
  return new THREE.Vector3(-p.x, 0, -p.z).normalize();
}

const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const easeOutBack = (k: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
const easeOutBounce = (k: number) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (k < 1 / d1) return n1 * k * k;
  if (k < 2 / d1) return n1 * (k -= 1.5 / d1) * k + 0.75;
  if (k < 2.5 / d1) return n1 * (k -= 2.25 / d1) * k + 0.9375;
  return n1 * (k -= 2.625 / d1) * k + 0.984375;
};

interface Tween {
  t: number;
  dur: number;
  update: (k: number) => void;
  resolve: () => void;
  ease: (k: number) => number;
}

export class SceneEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private container: HTMLElement;
  private raf = 0;
  private clock = new THREE.Clock();
  private tweens: Tween[] = [];
  private disposed = false;

  private tileBases: THREE.Mesh[] = [];
  private ownerFrames: THREE.Group[] = [];
  private frameMats: THREE.MeshStandardMaterial[] = [];
  private flags: THREE.Group[] = [];
  private flagMats: THREE.MeshStandardMaterial[] = [];
  private houseRoots: (THREE.Group | null)[] = [];
  private houseLevels: number[] = [];
  private pawns: THREE.Group[] = [];
  private pawnOffsets: THREE.Vector3[] = [];
  private marker: THREE.Mesh;
  private hoverRing: THREE.LineSegments;
  private dice: THREE.Mesh[] = [];
  private particles: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
  private curOwner: (number | null)[] = [];
  private curLevel: number[] = [];
  private playerColors: string[] = [];
  private raycaster = new THREE.Raycaster();
  private downPos = { x: 0, y: 0, t: 0 };
  private onTileClick: (i: number) => void;
  private ro?: ResizeObserver;

  constructor(container: HTMLElement, onTileClick: (i: number) => void) {
    this.container = container;
    this.onTileClick = onTileClick;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdbe7e4);
    this.scene.fog = new THREE.Fog(0xdbe7e4, 95, 168);
    this.buildSky();

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
    this.camera.position.set(27, 25, 27);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 110;
    this.controls.maxPolarAngle = 1.32;

    this.setupLights();
    this.buildGround();
    this.buildTiles();
    this.scene.add(buildCenterpiece());
    this.buildPerimeterTrees();

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.86, 28),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.64;
    this.scene.add(this.marker);

    this.hoverRing = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(3.7, 3.7)),
      new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95 })
    );
    this.hoverRing.rotation.x = -Math.PI / 2;
    this.hoverRing.visible = false;
    this.scene.add(this.hoverRing);

    for (let i = 0; i < 2; i++) {
      const d = makeDice();
      d.visible = false;
      d.scale.setScalar(0.9);
      this.scene.add(d);
      this.dice.push(d);
    }

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.renderer.domElement.addEventListener('pointerdown', this.handleDown);
    this.renderer.domElement.addEventListener('pointerup', this.handleUp);
    this.loop();
  }

  // ------------------------------------------------------------ 场景搭建
  private setupLights(): void {
    const hemi = new THREE.HemisphereLight(0xf4fbf4, 0xb2c2a6, 1.0);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
    sun.position.set(24, 36, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xdce8ff, 0.4);
    fill.position.set(-18, 14, -20);
    this.scene.add(fill);
  }

  private buildGround(): void {
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(42, 1.2, 42),
      new THREE.MeshStandardMaterial({ color: 0xeadfc8, roughness: 0.95 })
    );
    ground.position.y = -0.6;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 外围城墙式装饰块
    const wallMatA = new THREE.MeshStandardMaterial({ color: 0xd9cdb4, roughness: 0.9 });
    const wallMatB = new THREE.MeshStandardMaterial({ color: 0xcfc2a6, roughness: 0.9 });
    for (let i = 0; i < 44; i++) {
      const t = (i / 44) * Math.PI * 2;
      const r = 21.4;
      const block = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1 + (i % 3) * 0.25, 2.2), i % 2 ? wallMatA : wallMatB);
      block.position.set(Math.cos(t) * r, 0.3, Math.sin(t) * r);
      block.rotation.y = -t;
      block.castShadow = true;
      block.receiveShadow = true;
      this.scene.add(block);
    }
  }

  /** 云海天穹：自下而上的青蓝→暖白渐变，替代纯色背景 */
  private buildSky(): void {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#c9dfe8');
    grad.addColorStop(0.42, '#dfece6');
    grad.addColorStop(1, '#f0f4ea');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(210, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false })
    );
    this.scene.add(sky);
  }

  private buildTiles(): void {
    const baseGeo = new THREE.BoxGeometry(3.6, 0.55, 3.6);
    const cornerGeo = new THREE.BoxGeometry(3.9, 0.6, 3.9);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xf7f1e3, roughness: 0.85 });
    for (let i = 0; i < 32; i++) {
      const pos = tilePosition(i);
      const def = TILES[i];
      const isCorner = i % 8 === 0;
      const base = new THREE.Mesh(isCorner ? cornerGeo : baseGeo, baseMat.clone());
      base.position.set(pos.x, isCorner ? 0.3 : 0.275, pos.z);
      base.castShadow = true;
      base.receiveShadow = true;
      base.userData.tileIndex = i;
      this.scene.add(base);
      this.tileBases.push(base);

      const dir = inward(i);
      // 类型/地区色板
      const colorHex = def.type === 'city' ? regionOf(def.city!.region).color : TILE_STYLE[def.type].color;
      const plateMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), roughness: 0.6 });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.16, def.type === 'city' ? 0.85 : 1.4), plateMat);
      plate.position.set(pos.x + dir.x * 1.3, 0.6, pos.z + dir.z * 1.3);
      this.scene.add(plate);

      // 归属边框
      const frame = new THREE.Group();
      const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
      const mk = (w: number, d: number, x: number, z: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), frameMat);
        m.position.set(pos.x + x, 0.68, pos.z + z);
        frame.add(m);
      };
      mk(3.8, 0.22, 0, -1.82);
      mk(3.8, 0.22, 0, 1.82);
      mk(0.22, 3.8, -1.82, 0);
      mk(0.22, 3.8, 1.82, 0);
      frame.visible = false;
      this.scene.add(frame);
      this.ownerFrames.push(frame);
      this.frameMats.push(frameMat);

      // 归属小旗
      const flag = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0x7a6a50 }));
      pole.position.set(pos.x - dir.x * 1.7, 1.35, pos.z - dir.z * 1.7);
      const flagMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.6 });
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.5), flagMat);
      cloth.position.set(pos.x - dir.x * 1.7 + 0.45, 1.95, pos.z - dir.z * 1.7);
      flag.add(pole, cloth);
      flag.visible = false;
      this.scene.add(flag);
      this.flags.push(flag);
      this.flagMats.push(flagMat);

      // 落地铭牌：平铺于棋面外侧，字头朝向棋盘中心
      const labelMesh = makeTileLabel(def.name, colorHex, def.type === 'city' ? `¥${priceOf(i)}` : undefined);
      labelMesh.rotation.x = -Math.PI / 2;
      const labelHolder = new THREE.Group();
      labelHolder.position.set(pos.x - dir.x * 0.85, 0.63, pos.z - dir.z * 0.85);
      labelHolder.rotation.y = Math.atan2(-dir.x, -dir.z);
      labelHolder.add(labelMesh);
      this.scene.add(labelHolder);

      this.houseRoots.push(null);
      this.houseLevels.push(0);
      this.curOwner.push(null);
      this.curLevel.push(0);
    }
  }

  private buildPerimeterTrees(): void {
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2 + 0.2;
      const tree = makeTree(0.9 + Math.random() * 0.5);
      tree.position.set(Math.cos(t) * 19.6, 0.02, Math.sin(t) * 19.6);
      this.scene.add(tree);
    }
  }

  // ------------------------------------------------------------ 同步游戏状态
  syncState(state: GameState): void {
    // 玩家棋子
    if (this.pawns.length !== state.players.length || this.playerColors.join() !== state.players.map((p) => p.color).join()) {
      this.pawns.forEach((p) => this.scene.remove(p));
      this.pawns = [];
      this.playerColors = state.players.map((p) => p.color);
      state.players.forEach((p) => {
        const pawn = makePawn(p.color);
        this.scene.add(pawn);
        this.pawns.push(pawn);
      });
      this.pawnOffsets = state.players.map((_, i) => {
        const a = (i / Math.max(state.players.length, 2)) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
      });
    }
    state.players.forEach((p, i) => {
      const pawn = this.pawns[i];
      const target = tilePosition(p.pos).clone().add(this.pawnOffsets[i] ?? new THREE.Vector3());
      target.y = 0;
      if (!this.tweens.length || pawn.position.distanceTo(target) > 0.5) {
        // 非动画期间直接吸附（例如读档恢复）
        if (!this.tweens.some((t) => t.update.length > 0)) pawn.position.copy(target);
      }
      pawn.visible = !p.bankrupt;
    });
    const cur = state.players[state.current];
    if (cur && this.pawns[state.current]) {
      this.marker.position.set(this.pawns[state.current].position.x, 0.64, this.pawns[state.current].position.z);
      this.marker.visible = !cur.bankrupt;
    }

    // 地块归属与建筑
    state.tiles.forEach((ts, i) => {
      if (this.curOwner[i] !== ts.owner) {
        this.curOwner[i] = ts.owner;
        const color = new THREE.Color(ts.owner === null ? 0xffffff : state.players[ts.owner].color);
        this.frameMats[i].color.copy(color);
        this.flagMats[i].color.copy(color);
        this.ownerFrames[i].visible = ts.owner !== null;
        this.flags[i].visible = ts.owner !== null;
      }
      if (this.curLevel[i] !== ts.level) {
        this.curLevel[i] = ts.level;
        this.setHouse(i, ts.level, state.players[ts.owner ?? 0]?.color ?? '#d84b3a', false);
      }
    });
  }

  private setHouse(tile: number, level: number, accent: string, animate: boolean): void {
    const old = this.houseRoots[tile];
    if (old) {
      this.scene.remove(old);
      this.houseRoots[tile] = null;
    }
    if (level <= 0) return;
    const pos = tilePosition(tile);
    const dir = inward(tile);
    const house = makeHouse(level - 1, accent);
    house.position.set(pos.x + dir.x * 0.55, 0.55, pos.z + dir.z * 0.55);
    house.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
    this.scene.add(house);
    this.houseRoots[tile] = house;
    if (animate) {
      house.scale.set(0.9, 0.01, 0.9);
      void this.tween(700, (k) => {
        house.scale.y = Math.max(0.01, k);
        house.position.y = 0.55 + k * 0.15;
      }, easeOutBack).then(() => {
        house.scale.y = 1;
        house.position.y = 0.55;
        this.spawnParticles(tile, accent);
      });
    }
  }

  // ------------------------------------------------------------ 动画
  private tween(dur: number, update: (k: number) => void, ease: (k: number) => number = easeOutCubic): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.push({ t: 0, dur, update, resolve, ease });
    });
  }

  async animateDice(a: number, b: number): Promise<void> {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const center = this.camera.position.clone().add(forward.clone().multiplyScalar(10));
    const restY = Math.max(1.0, center.y - 2.4);
    const targets = [
      center.clone().add(right.clone().multiplyScalar(-1.05)).setY(restY),
      center.clone().add(right.clone().multiplyScalar(1.05)).setY(restY)
    ];
    const values = [a, b];
    const spins: { axis: THREE.Vector3; speed: number; startQ: THREE.Quaternion; endQ: THREE.Quaternion }[] = [];
    this.dice.forEach((d, i) => {
      d.visible = true;
      const start = targets[i].clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 7 + Math.random() * 3, (Math.random() - 0.5) * 4));
      d.position.copy(start);
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
      const endQ = yaw.multiply(faceUpQuaternion(values[i]));
      spins.push({
        axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        speed: 8 + Math.random() * 8,
        startQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
        endQ
      });
      d.userData.start = start;
      d.userData.target = targets[i];
      d.userData.spin = spins[i];
    });
    await this.tween(1150, (k) => {
      this.dice.forEach((d) => {
        const start = d.userData.start as THREE.Vector3;
        const target = d.userData.target as THREE.Vector3;
        const spin = d.userData.spin as (typeof spins)[0];
        d.position.lerpVectors(start, target, k);
        d.position.y = start.y + (target.y - start.y) * easeOutBounce(k);
        const q = new THREE.Quaternion().slerpQuaternions(spin.startQ, spin.endQ, easeInOut(k));
        const extra = new THREE.Quaternion().setFromAxisAngle(spin.axis, spin.speed * (1 - k));
        d.quaternion.copy(q).multiply(extra);
      });
    });
    await new Promise((r) => setTimeout(r, 350));
  }

  hideDice(): void {
    this.dice.forEach((d) => (d.visible = false));
  }

  async animateMove(pid: number, path: number[]): Promise<void> {
    this.hideDice();
    const pawn = this.pawns[pid];
    if (!pawn) return;
    for (const step of path) {
      const target = tilePosition(step).clone().add(this.pawnOffsets[pid] ?? new THREE.Vector3());
      const start = pawn.position.clone();
      const dx = target.x - start.x;
      const dz = target.z - start.z;
      if (Math.abs(dx) + Math.abs(dz) > 0.01) {
        pawn.rotation.y = Math.atan2(dx, dz);
      }
      await this.tween(240, (k) => {
        pawn.position.x = start.x + dx * k;
        pawn.position.z = start.z + dz * k;
        pawn.position.y = Math.sin(k * Math.PI) * 1.05;
        pawn.rotation.x = Math.sin(k * Math.PI) * -0.18;
      });
      pawn.position.y = 0;
      pawn.rotation.x = 0;
    }
    this.marker.position.set(pawn.position.x, 0.64, pawn.position.z);
  }

  async animateBuild(tile: number, level: number): Promise<void> {
    const fromTarget = this.controls.target.clone();
    const fromCam = this.camera.position.clone();
    await this.focusTile(tile);
    await new Promise((r) => setTimeout(r, 120));
    const state = (this as any)._lastState as GameState | null;
    const owner = state ? state.tiles[tile].owner : null;
    const accent = state && owner !== null ? state.players[owner].color : '#d84b3a';
    this.setHouse(tile, level, accent, true);
    await new Promise((r) => setTimeout(r, 700));
    // 镜头回到聚焦前的全景位置
    const t0 = this.controls.target.clone();
    const c0 = this.camera.position.clone();
    await this.tween(550, (k) => {
      this.controls.target.lerpVectors(t0, fromTarget, k);
      this.camera.position.lerpVectors(c0, fromCam, k);
    }, easeInOut);
  }

  async focusTile(tile: number): Promise<void> {
    const pos = tilePosition(tile);
    const fromTarget = this.controls.target.clone();
    const fromCam = this.camera.position.clone();
    const dir = fromCam.clone().sub(fromTarget).normalize();
    const toTarget = pos.clone();
    const toCam = pos.clone().add(dir.multiplyScalar(15)).add(new THREE.Vector3(0, 6, 0));
    await this.tween(600, (k) => {
      this.controls.target.lerpVectors(fromTarget, toTarget, k);
      this.camera.position.lerpVectors(fromCam, toCam, k);
    }, easeInOut);
  }

  async resetCamera(): Promise<void> {
    const fromTarget = this.controls.target.clone();
    const fromCam = this.camera.position.clone();
    const toTarget = new THREE.Vector3(0, 0, 0);
    const toCam = new THREE.Vector3(27, 25, 27);
    await this.tween(650, (k) => {
      this.controls.target.lerpVectors(fromTarget, toTarget, k);
      this.camera.position.lerpVectors(fromCam, toCam, k);
    }, easeInOut);
  }

  private spawnParticles(tile: number, accent: string): void {
    const pos = tilePosition(tile);
    const color = new THREE.Color(accent);
    for (let i = 0; i < 18; i++) {
      const mesh = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.14 + Math.random() * 0.1),
        new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xf0c040 : color })
      );
      mesh.position.set(pos.x + (Math.random() - 0.5), 1.2, pos.z + (Math.random() - 0.5) * 1.5);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 2.4, 3 + Math.random() * 3, (Math.random() - 0.5) * 2.4),
        life: 1
      });
    }
  }

  // ------------------------------------------------------------ 拾取与投影
  private handleDown = (e: PointerEvent): void => {
    this.downPos = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private handleUp = (e: PointerEvent): void => {
    const dx = e.clientX - this.downPos.x;
    const dy = e.clientY - this.downPos.y;
    if (Math.hypot(dx, dy) > 6 || performance.now() - this.downPos.t > 450) return;
    const idx = this.pickTile(e.clientX, e.clientY);
    if (idx !== null) this.onTileClick(idx);
  };

  /** 地块（含上方偏移）投影到容器内 CSS 像素坐标 */
  getScreenPos(tile: number): { x: number; y: number } {
    const world = tilePosition(tile).clone().add(new THREE.Vector3(0, 1.6, 0));
    world.project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: ((world.x + 1) / 2) * rect.width,
      y: ((-world.y + 1) / 2) * rect.height
    };
  }

  setLastState(s: GameState): void {
    (this as any)._lastState = s;
  }

  // ------------------------------------------------------------ 渲染循环
  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    // 补间
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt * 1000;
      const k = Math.min(1, tw.t / tw.dur);
      tw.update(tw.ease(k));
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.resolve();
      }
    }

    // 粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt * 1.4;
      p.vel.y -= dt * 6;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 5;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life);
      (p.mesh.material as THREE.MeshBasicMaterial).transparent = true;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }

    // 当前玩家标记
    this.marker.rotation.z += dt * 1.6;
    const s = 1 + Math.sin(performance.now() * 0.005) * 0.08;
    this.marker.scale.set(s, s, 1);

    // 棋子呼吸
    this.pawns.forEach((p, i) => {
      if (p.visible && this.tweens.length === 0) {
        p.position.y = Math.sin(performance.now() * 0.004 + i) * 0.05 + 0.02;
      }
    });

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  /** 命中测试：返回鼠标下的地块索引（无则 null） */
  pickTile(clientX: number, clientY: number): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.tileBases, false);
    return hits.length > 0 ? (hits[0].object.userData.tileIndex as number) : null;
  }

  /** 悬停高亮：传入地块索引显示描边，null 隐藏 */
  setHover(tile: number | null): void {
    if (tile === null) {
      this.hoverRing.visible = false;
      return;
    }
    const pos = tilePosition(tile);
    this.hoverRing.position.set(pos.x, 0.62, pos.z);
    this.hoverRing.visible = true;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.handleDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handleUp);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
