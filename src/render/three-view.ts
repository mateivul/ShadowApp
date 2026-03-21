import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import type { AppConfig, BuildingInput } from "../types";
import { d2r } from "../utils";
import { localToUTC, sunPos } from "../solar";

function makeLabel(text: string, style: "building" | "guide" = "building"): THREE.Sprite {
  const cvs = document.createElement("canvas");
  cvs.width = 256;
  cvs.height = 52;
  const c = cvs.getContext("2d")!;
  c.fillStyle = style === "guide" ? "rgba(16,40,90,0.72)" : "rgba(20,28,42,0.72)";
  c.beginPath();
  c.roundRect(2, 2, 252, 48, 12);
  c.fill();
  c.fillStyle = style === "guide" ? "#a0c8ff" : "#f0f4ff";
  c.font = 'bold 24px "Space Mono", monospace';
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text.length > 17 ? text.slice(0, 16) + "…" : text, 128, 26);
  const tex = new THREE.CanvasTexture(cvs);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(5, 5 * (52 / 256), 1);
  return spr;
}

export class ThreeView {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;

  private sky: Sky;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;

  private sunSphere: THREE.Mesh;
  private starsMesh: THREE.Points;
  private sunArcGroup = new THREE.Group();

  private buildings = new THREE.Group();
  private guides = new THREE.Group();
  private groundGroup = new THREE.Group();

  private groundMat: THREE.MeshStandardMaterial | null = null;

  private rafId: number | null = null;
  private seenPlot = "";
  private seenArc = "";
  private seenBuildings = "";
  private initialized = false;

  onFrame: (() => void) | null = null;

  private pressedKeys = new Set<string>();
  private keyDownHandler: ((e: KeyboardEvent) => void) | null = null;
  private keyUpHandler: ((e: KeyboardEvent) => void) | null = null;

  private canvas: HTMLCanvasElement | null = null;
  private raycaster = new THREE.Raycaster();
  private buildingMap = new Map<THREE.Object3D, BuildingInput>();
  private hoveredMesh: THREE.Object3D | null = null;
  private mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private mouseLeaveHandler: (() => void) | null = null;
  onBuildingHover: ((info: BuildingInput | null) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const w = canvas.offsetWidth || canvas.parentElement?.clientWidth || 800;
    const h = canvas.offsetHeight || canvas.parentElement?.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.5;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 8000);

    this.sky = new Sky();
    this.sky.scale.setScalar(100000);
    this.scene.add(this.sky);
    const su = (this.sky.material as THREE.ShaderMaterial).uniforms;
    su["turbidity"].value = 6;
    su["rayleigh"].value = 1.2;
    su["mieCoefficient"].value = 0.006;
    su["mieDirectionalG"].value = 0.88;

    this.hemi = new THREE.HemisphereLight(0x88c4e8, 0x88a870, 0.6);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff4e0, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.normalBias = 0.006;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.sunSphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffaa }),
    );
    this.scene.add(this.sunSphere);

    this.starsMesh = this.buildStars();
    this.scene.add(this.starsMesh);

    this.scene.add(this.sunArcGroup);

    this.scene.add(this.buildings);
    this.scene.add(this.guides);
    this.scene.add(this.groundGroup);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;

    this.mouseMoveHandler = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const my = ((e.clientY - rect.top) / rect.height) * -2 + 1;
      this.raycaster.setFromCamera(new THREE.Vector2(mx, my), this.camera);
      const hits = this.raycaster.intersectObjects(this.buildings.children, false);
      const hit = hits.length > 0 ? hits[0].object : null;
      if (hit !== this.hoveredMesh) {
        this.hoveredMesh = hit;
        this.onBuildingHover?.(hit ? (this.buildingMap.get(hit) ?? null) : null);
      }
    };
    this.mouseLeaveHandler = () => {
      if (this.hoveredMesh !== null) {
        this.hoveredMesh = null;
        this.onBuildingHover?.(null);
      }
    };
    canvas.addEventListener("mousemove", this.mouseMoveHandler);
    canvas.addEventListener("mouseleave", this.mouseLeaveHandler);
  }

  startLoop(): void {
    if (this.rafId !== null) return;

    this.keyDownHandler = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      if ("wasdqe".includes(e.key.toLowerCase()) && e.key.length === 1) {
        this.pressedKeys.add(e.key.toLowerCase());
      }
    };
    this.keyUpHandler = (e: KeyboardEvent) => {
      this.pressedKeys.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", this.keyDownHandler);
    window.addEventListener("keyup", this.keyUpHandler);

    const tick = () => {
      if (this.pressedKeys.size > 0) {
        const speed = Math.max(0.1, this.camera.position.distanceTo(this.controls.target) * 0.012);
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        dir.y = 0;
        dir.normalize();
        const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
        const move = new THREE.Vector3();
        if (this.pressedKeys.has("w")) move.addScaledVector(dir, speed);
        if (this.pressedKeys.has("s")) move.addScaledVector(dir, -speed);
        if (this.pressedKeys.has("a")) move.addScaledVector(right, -speed);
        if (this.pressedKeys.has("d")) move.addScaledVector(right, speed);
        if (this.pressedKeys.has("q")) move.y -= speed * 0.5;
        if (this.pressedKeys.has("e")) move.y += speed * 0.5;
        this.camera.position.add(move);
        this.controls.target.add(move);
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.onFrame?.();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.keyDownHandler) {
      window.removeEventListener("keydown", this.keyDownHandler);
      this.keyDownHandler = null;
    }
    if (this.keyUpHandler) {
      window.removeEventListener("keyup", this.keyUpHandler);
      this.keyUpHandler = null;
    }
    this.pressedKeys.clear();
  }

  resetCamera(plotW: number, plotD: number): void {
    const cx = plotW / 2;
    const cy = plotD / 2;
    const diag = Math.sqrt(plotW ** 2 + plotD ** 2);
    this.controls.target.set(cx, 0, -cy);
    this.camera.position.set(cx + diag * 0.72, diag * 0.56, -cy + diag * 0.72);
    this.controls.update();
  }

  sync(
    cfg: AppConfig,
    sunAzDeg: number,
    sunAltDeg: number,
    month: number,
    day: number,
    lat: number,
    lng: number,
    utcOffset: number,
  ): void {
    const { plot } = cfg;
    const cx = plot.width / 2;
    const cy = plot.depth / 2;
    const azR = d2r(sunAzDeg);
    const altR = d2r(sunAltDeg);
    const dayT = Math.max(0, Math.min(1, (sunAltDeg + 4) / 20));

    const skyX = Math.sin(azR) * Math.cos(altR);
    const skyY = Math.sin(altR);
    const skyZ = -Math.cos(azR) * Math.cos(altR);
    const su = (this.sky.material as THREE.ShaderMaterial).uniforms;
    su["sunPosition"].value.set(skyX, skyY, skyZ);
    su["turbidity"].value = sunAltDeg > 30 ? 4 : 8 - sunAltDeg * 0.1;
    su["rayleigh"].value = sunAltDeg < 5 ? 3.0 : 1.2;
    this.renderer.toneMappingExposure = 0.1 + dayT * 0.45;

    const starsOpacity = Math.max(0, Math.min(1, (-sunAltDeg - 5) / 12));
    (this.starsMesh.material as THREE.PointsMaterial).opacity = starsOpacity;

    this.hemi.color.setHex(sunAltDeg < 8 ? 0xff9955 : 0x88c4e8);
    this.hemi.groundColor.setHex(0x88a870);
    this.hemi.intensity = 0.4 + dayT * 0.35;

    const dist = Math.max(plot.width, plot.depth) * 5;
    this.sun.target.position.set(cx, 0, -cy);
    this.sun.position.set(cx + skyX * dist, Math.max(0.5, skyY) * dist, -cy + skyZ * dist);
    this.sun.intensity = dayT * 3.0;
    this.sun.color.setHex(sunAltDeg < 12 ? 0xffaa44 : 0xfff8ee);

    const pad = Math.max(plot.width, plot.depth) * 0.9;
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -pad;
    sc.right = pad;
    sc.top = pad;
    sc.bottom = -pad;
    sc.far = dist * 2.5;
    sc.updateProjectionMatrix();

    const sDist = dist * 0.7;
    this.sunSphere.position.set(cx + skyX * sDist, skyY * sDist, -cy + skyZ * sDist);
    this.sunSphere.visible = sunAltDeg > 1;
    this.sunSphere.scale.setScalar(sDist * 0.025);
    (this.sunSphere.material as THREE.MeshBasicMaterial).color.setHex(sunAltDeg < 10 ? 0xff8800 : 0xffff99);

    const plotKey = `${plot.width}x${plot.depth}`;
    if (plotKey !== this.seenPlot) {
      this.seenPlot = plotKey;
      this.rebuildGround(plot.width, plot.depth);
      this.initialized = false;
    }

    if (this.groundMat) {
      this.groundMat.color.setHex(0).lerp(new THREE.Color(0x1a2410), 1 - dayT);
      this.groundMat.color.lerp(new THREE.Color(0xc2d9a0), dayT);
    }

    if (!this.initialized) {
      this.initialized = true;
      this.resetCamera(plot.width, plot.depth);
    }

    const arcKey = `${month}/${day}/${lat.toFixed(3)}/${lng.toFixed(3)}/${utcOffset}/${plotKey}`;
    if (arcKey !== this.seenArc) {
      this.seenArc = arcKey;
      this.rebuildSunArc(month, day, lat, lng, utcOffset, cx, cy, sDist);
    }

    const buildingsKey = JSON.stringify(
      cfg.buildings.map((b) => ({
        x: b.x,
        y: b.y,
        w: b.w ?? b.width ?? 1,
        d: b.d ?? b.depth ?? 1,
        h: b.roofHeight ?? b.height ?? 3,
        ang: b.angleDeg ?? 0,
        col: b.color,
        lbl: b.label,
      })),
    );
    if (buildingsKey !== this.seenBuildings) {
      this.seenBuildings = buildingsKey;
      this.buildingMap.clear();
      this.clearGroup(this.buildings);
      for (const b of cfg.buildings) {
        const bw = b.width ?? b.w ?? 1;
        const bd = b.depth ?? b.d ?? 1;
        const bh = b.roofHeight ?? b.height ?? 3;
        const ang = b.angleDeg ?? 0;
        const col = new THREE.Color(b.color ?? "#eef4ff");

        const wallGeo = new THREE.BoxGeometry(bw, bh, bd);
        const mesh = new THREE.Mesh(
          wallGeo,
          new THREE.MeshStandardMaterial({
            color: col,
            roughness: 0.78,
            metalness: 0.02,
          }),
        );
        mesh.position.set(b.x + bw / 2, bh / 2, -(b.y + bd / 2));
        mesh.rotation.y = -d2r(ang);
        mesh.castShadow = mesh.receiveShadow = true;
        this.buildings.add(mesh);

        const roofMesh = new THREE.Mesh(
          new THREE.BoxGeometry(bw + 0.12, 0.12, bd + 0.12),
          new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.8), roughness: 0.65 }),
        );
        roofMesh.position.set(0, bh / 2 + 0.06, 0);
        roofMesh.castShadow = true;
        mesh.add(roofMesh);

        mesh.add(
          new THREE.LineSegments(
            new THREE.EdgesGeometry(wallGeo, 10),
            new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.14 }),
          ),
        );

        if (b.label?.trim()) {
          const lbl = makeLabel(b.label.trim());
          lbl.position.set(0, bh / 2 + 2.0, 0);
          mesh.add(lbl);
        }

        this.buildingMap.set(mesh, b);
      }
    }

    this.clearGroup(this.guides);
    for (const g of cfg.guideItems ?? []) {
      const hw = g.width / 2,
        hd = g.depth / 2,
        y = 0.06;
      const pts = [
        new THREE.Vector3(-hw, y, -hd),
        new THREE.Vector3(hw, y, -hd),
        new THREE.Vector3(hw, y, hd),
        new THREE.Vector3(-hw, y, hd),
      ];
      const line = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x2060c8, transparent: true, opacity: 0.9 }),
      );
      line.position.set(g.x + g.width / 2, 0, -(g.y + g.depth / 2));
      line.rotation.y = -d2r(g.angleDeg);
      this.guides.add(line);
      if (g.label?.trim()) {
        const lbl = makeLabel(g.label.trim(), "guide");
        lbl.position.set(g.x + g.width / 2, 1.5, -(g.y + g.depth / 2));
        this.guides.add(lbl);
      }
    }
  }

  getCompassHeading(): number {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const az = Math.atan2(dir.x, -dir.z) * (180 / Math.PI);
    return ((az % 360) + 360) % 360;
  }

  snapshot(callback: (blob: Blob | null) => void): void {
    this.renderer.render(this.scene, this.camera);
    this.canvas?.toBlob(callback);
  }

  resize(w: number, h: number): void {
    if (w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  dispose(): void {
    this.stopLoop();
    if (this.canvas && this.mouseMoveHandler) this.canvas.removeEventListener("mousemove", this.mouseMoveHandler);
    if (this.canvas && this.mouseLeaveHandler) this.canvas.removeEventListener("mouseleave", this.mouseLeaveHandler);
    [this.buildings, this.guides, this.groundGroup, this.sunArcGroup].forEach((g) => this.clearGroup(g));
    this.starsMesh.geometry.dispose();
    (this.starsMesh.material as THREE.Material).dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }

  private buildStars(): THREE.Points {
    const count = 1800;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - Math.random());
      const r = 3500 + Math.random() * 500;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.8,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
    });
    return new THREE.Points(geo, mat);
  }

  private rebuildSunArc(
    month: number,
    day: number,
    lat: number,
    lng: number,
    utcOffset: number,
    cx: number,
    cy: number,
    arcDist: number,
  ): void {
    this.clearGroup(this.sunArcGroup);

    const positions: number[] = [];
    const colors: number[] = [];
    const col = new THREE.Color();

    for (let m = 0; m < 1440; m += 8) {
      const utcDate = localToUTC(month, day, m, utcOffset);
      const pos = sunPos(utcDate, lat, lng);
      if (pos.altitude <= 0.5) continue;

      const azR = d2r(pos.azimuth);
      const altR = d2r(pos.altitude);
      positions.push(
        cx + Math.sin(azR) * Math.cos(altR) * arcDist,
        Math.sin(altR) * arcDist,
        -cy - Math.cos(azR) * Math.cos(altR) * arcDist,
      );

      const t = Math.min(1, pos.altitude / 50);
      col.setRGB(1.0, 0.55 + t * 0.45, t * 0.5);
      colors.push(col.r, col.g, col.b);
    }

    if (positions.length < 6) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
    });
    this.sunArcGroup.add(new THREE.Line(geo, mat));

    for (let h = 0; h < 24; h++) {
      const m = h * 60;
      const utcDate = localToUTC(month, day, m, utcOffset);
      const pos = sunPos(utcDate, lat, lng);
      if (pos.altitude <= 0.5) continue;

      const azR = d2r(pos.azimuth);
      const altR = d2r(pos.altitude);
      const px = cx + Math.sin(azR) * Math.cos(altR) * arcDist;
      const py = Math.sin(altR) * arcDist;
      const pz = -cy - Math.cos(azR) * Math.cos(altR) * arcDist;

      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 6, 4),
        new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.7 }),
      );
      dot.scale.setScalar(arcDist * 0.006);
      dot.position.set(px, py, pz);
      this.sunArcGroup.add(dot);
    }
  }

  private rebuildGround(plotW: number, plotD: number): void {
    this.clearGroup(this.groundGroup);
    this.groundMat = null;
    const cx = plotW / 2,
      cy = plotD / 2;

    this.groundMat = new THREE.MeshStandardMaterial({ color: 0xc2d9a0, roughness: 0.93, metalness: 0 });
    const gMesh = new THREE.Mesh(new THREE.PlaneGeometry(plotW, plotD), this.groundMat);
    gMesh.rotation.x = -Math.PI / 2;
    gMesh.position.set(cx, 0, -cy);
    gMesh.receiveShadow = true;
    this.groundGroup.add(gMesh);

    const bPts = [
      new THREE.Vector3(0, 0.04, 0),
      new THREE.Vector3(plotW, 0.04, 0),
      new THREE.Vector3(plotW, 0.04, -plotD),
      new THREE.Vector3(0, 0.04, -plotD),
    ];
    this.groundGroup.add(
      new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(bPts),
        new THREE.LineBasicMaterial({ color: 0x5a7a4a }),
      ),
    );

    const gMat = new THREE.LineBasicMaterial({ color: 0x6a9a5a, transparent: true, opacity: 0.22 });
    for (let x = 5; x < plotW; x += 5) {
      this.groundGroup.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0.02, 0), new THREE.Vector3(x, 0.02, -plotD)]),
          gMat,
        ),
      );
    }
    for (let z = 5; z < plotD; z += 5) {
      this.groundGroup.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0.02, -z),
            new THREE.Vector3(plotW, 0.02, -z),
          ]),
          gMat,
        ),
      );
    }

    const dirs: Array<[string, number, number]> = [
      ["N", cx, 1.0],
      ["S", cx, -plotD - 1.0],
      ["W", -1.0, -cy],
      ["E", plotW + 1.0, -cy],
    ];
    for (const [lbl, lx, lz] of dirs) {
      const spr = makeLabel(lbl);
      spr.scale.set(2.8, 2.8 * (52 / 256), 1);
      spr.position.set(lx, 0.6, lz);
      this.groundGroup.add(spr);
    }
  }

  private clearGroup(group: THREE.Group): void {
    for (const obj of [...group.children]) {
      group.remove(obj);
      this.disposeObj(obj);
    }
  }

  private disposeObj(obj: THREE.Object3D): void {
    for (const child of [...obj.children]) {
      obj.remove(child);
      this.disposeObj(child);
    }
    if (
      obj instanceof THREE.Mesh ||
      obj instanceof THREE.LineSegments ||
      obj instanceof THREE.LineLoop ||
      obj instanceof THREE.Line ||
      obj instanceof THREE.Sprite ||
      obj instanceof THREE.Points
    ) {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m instanceof THREE.SpriteMaterial) m.map?.dispose();
        if (m instanceof THREE.MeshStandardMaterial) m.map?.dispose();
        (m as THREE.Material)?.dispose();
      }
    }
  }
}
