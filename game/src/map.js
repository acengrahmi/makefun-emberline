// FOUNDRY YARD — an original industrial map for EMBERLINE, built from boxes,
// cylinders and painted ground markings. Never a copy of any commercial map:
// two sites (A Furnace, B Silos), a mid lane choked by a gantry crane, long
// lanes down both walls, and diagonal alleys. The same file also owns the
// waypoint graph the bots navigate and the line-of-sight test they see through.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOUNDS = { minX: -28, maxX: 28, minZ: -20, maxZ: 20 };

function makeTextTexture(text, { size = 256, fg = '#f0a830', bg = '#23262d', font = 96 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(10, 10, size - 20, size - 20);
  g.fillStyle = fg;
  g.font = `700 ${font}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, size / 2, size / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignTexture(lines, { width = 512, height = 128, fg = '#ece7db', bg = '#1b1e26' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, width, height);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 56px system-ui, sans-serif`;
  g.fillText(lines[0], width / 2, lines.length > 1 ? 44 : height / 2);
  if (lines.length > 1) {
    g.font = `500 34px system-ui, sans-serif`;
    g.fillStyle = '#9aa1ad';
    g.fillText(lines[1], width / 2, 96);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];
  const minimapRects = [];
  const flickerLights = [];

  const mats = {};
  for (const name of Object.keys(PALETTE)) {
    mats[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'amber' || name === 'ember' ? 0.5 : 0.92,
      metalness: name === 'steel' || name === 'steelDark' ? 0.45 : 0.05,
    });
  }
  const groundMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ground), roughness: 0.95, metalness: 0.02 });
  const groundDarkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.groundDark), roughness: 0.95, metalness: 0.02 });
  const emissiveAmber = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.amber), emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 1.6, roughness: 0.4 });
  const emissiveTeal = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), emissive: new THREE.Color(PALETTE.teal), emissiveIntensity: 1.4, roughness: 0.4 });
  const emissiveOrange = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ff5a00'), emissive: new THREE.Color('#ff5a00'), emissiveIntensity: 2.2, roughness: 0.4 });

  function edges(mesh) {
    const line = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x14161a, transparent: true, opacity: 0.55 }),
    );
    mesh.add(line);
    return mesh;
  }

  function box(w, h, d, x, y, z, material, { solid = true, rect = true } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
      if (rect) minimapRects.push({ x: x - w / 2, z: z - d / 2, w, d, c: material === mats.steel ? '#3a3f4a' : material === mats.rust ? '#7a4a2e' : '#555a63' });
    }
    return mesh;
  }

  function cyl(r, h, x, y, z, material, segments = 18) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    minimapRects.push({ x: x - r, z: z - r, w: r * 2, d: r * 2, c: '#4a505c' });
    return mesh;
  }

  function flat(w, d, x, z, material, y = 0.02) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // ---- ground: one slab, darker patches, painted lane lines and site zones
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(56.4, 40.4), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  flat(10, 40, -23, 0, groundDarkMat, 0.015);
  flat(10, 40, 23, 0, groundDarkMat, 0.015);
  flat(56, 4, 0, 17.5, groundDarkMat, 0.015);
  flat(56, 4, 0, -17.5, groundDarkMat, 0.015);
  flat(56, 0.5, 0, 0, new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hazard), roughness: 0.8 }), 0.03);
  flat(0.5, 40, -14, 0, new THREE.MeshStandardMaterial({ color: new THREE.Color('#3f444e'), roughness: 0.9 }), 0.03);
  flat(0.5, 40, 14, 0, new THREE.MeshStandardMaterial({ color: new THREE.Color('#3f444e'), roughness: 0.9 }), 0.03);

  // ---- perimeter walls
  box(56.8, 5.5, 0.6, 0, 2.75, -20.3, mats.steelDark);
  box(56.8, 5.5, 0.6, 0, 2.75, 20.3, mats.steelDark);
  box(0.6, 5.5, 40.8, -28.3, 2.75, 0, mats.steelDark);
  box(0.6, 5.5, 40.8, 28.3, 2.75, 0, mats.steelDark);
  // wall caps in team colours: amber south (attacker side), teal north (defender side)
  box(56.8, 0.25, 0.7, 0, 5.6, 20.3, emissiveAmber, { solid: false, rect: false });
  box(56.8, 0.25, 0.7, 0, 5.6, -20.3, emissiveTeal, { solid: false, rect: false });

  // ---- site A: the Furnace (west). Big furnace block, chimney, heat glow.
  const furnace = box(6, 5, 4, -24, 2.5, -15, mats.rust);
  edges(furnace);
  const chimney = cyl(1.1, 8, -25.5, 4, -17.5, mats.steelDark, 12);
  void chimney;
  box(3.4, 1.6, 0.5, -21, 1.9, -13.2, emissiveOrange, { solid: false, rect: false }); // furnace mouth glow
  const furnaceLight = new THREE.PointLight(new THREE.Color('#ff7a1a'), 26, 18, 1.6);
  furnaceLight.position.set(-20.5, 2, -12.5);
  scene.add(furnaceLight);
  flickerLights.push({ light: furnaceLight, base: 26, speed: 7, amp: 5 });
  const signA = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 4.4),
    new THREE.MeshBasicMaterial({ map: makeTextTexture('A', { fg: '#f0a830' }), transparent: true }),
  );
  signA.position.set(-19, 4.4, -16.5);
  signA.rotation.y = Math.PI / 4;
  group.add(signA);

  // ---- site B: the Silos (east). Two tall cylinders and a pipe run.
  cyl(2.6, 7.5, 23, 3.75, -15.5, mats.steel, 20);
  cyl(2.2, 6.2, 18.5, 3.1, -17.5, mats.steelDark, 20);
  box(8, 0.8, 1.2, 20.5, 6.6, -16.5, mats.rust);
  const siloLight = new THREE.PointLight(new THREE.Color(PALETTE.teal), 18, 16, 1.6);
  siloLight.position.set(20, 2.2, -12.5);
  scene.add(siloLight);
  const signB = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 4.4),
    new THREE.MeshBasicMaterial({ map: makeTextTexture('B', { fg: '#35c8b8' }), transparent: true }),
  );
  signB.position.set(19, 4.4, -16.5);
  signB.rotation.y = -Math.PI / 4;
  group.add(signB);

  // ---- site zones painted on the ground
  const ringGeo = new THREE.RingGeometry(3.4, 5, 40);
  const ringA = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ringA.rotation.x = -Math.PI / 2;
  ringA.position.set(-19, 0.04, -13);
  group.add(ringA);
  const ringB = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.teal), transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ringB.rotation.x = -Math.PI / 2;
  ringB.position.set(19, 0.04, -13);
  group.add(ringB);

  // ---- mid: gantry crane choke. Two legs, a beam, a hanging hook block.
  box(0.9, 4.6, 0.9, -3.4, 2.3, 0, mats.rust);
  box(0.9, 4.6, 0.9, 3.4, 2.3, 0, mats.rust);
  box(8.4, 0.7, 1.1, 0, 4.9, 0, mats.steel);
  box(1.4, 1.0, 1.4, 1.2, 3.9, 0, mats.hazard);
  box(1.2, 0.6, 1.2, -1.6, 0.3, 0, mats.hazard); // hook counterweight on the ground
  // stepped platform south of mid, a vantage you can jump onto
  box(3.2, 0.4, 2.2, -8, 0.2, 6, mats.steel);
  box(3.2, 0.8, 2.2, -8, 0.4, 6, mats.steelDark);
  box(2.4, 0.4, 1.6, 8, 0.2, -4, mats.steel);
  box(2.4, 0.8, 1.6, 8, 0.4, -4, mats.steelDark);

  // ---- containers and crates: cover along every lane
  function container(x, z, rotY, color) {
    const m = box(6.2, 2.6, 2.5, x, 1.3, z, color);
    m.rotation.y = rotY;
    edges(m);
    // recompute the collider after rotation (Box3 of a rotated box still bounds it)
    colliders[colliders.length - 1] = new THREE.Box3().setFromObject(m);
    return m;
  }
  container(-24, 6, 0, mats.steel); // A-long
  container(-24, -6, 0, mats.rust); // A-long north
  container(24, 6, 0, mats.rust); // B-long
  container(24, -6, 0, mats.steel); // B-long north
  container(-11, -9, Math.PI / 2, mats.steel); // A approach
  container(11, -9, Math.PI / 2, mats.rust); // B approach

  function crate(x, z, s = 1.2, y = null) {
    const m = box(s, s, s, x, (y ?? s / 2), z, mats.crate);
    edges(m);
    return m;
  }
  crate(-5, 4); crate(-3.6, 4.2, 0.9); crate(5, -2); crate(4, 8, 1.2); crate(-4, -8, 1.2);
  crate(-16, 2); crate(16, 2); crate(-18, -8, 1.4); crate(18, -8, 1.4);
  crate(-9, 12); crate(9, 12); crate(-20, 8); crate(20, 8);
  crate(-6, -13, 1.2); crate(6, -13, 1.2); crate(-13, -14, 1.0); crate(13, -14, 1.0);
  // low walls to crouch behind
  box(3.4, 1.1, 0.5, -10, 0.55, -6, mats.steelDark);
  box(3.4, 1.1, 0.5, 10, 0.55, -6, mats.steelDark);
  box(0.5, 1.1, 3.4, 0, 0.55, -11, mats.steelDark);
  box(4.2, 1.1, 0.5, 0, 0.55, 11, mats.steelDark);
  // barrels
  cyl(0.55, 1.15, -2, 0.58, 8, mats.barrel, 12);
  cyl(0.55, 1.15, -1, 0.58, 8.6, mats.barrel, 12);
  cyl(0.55, 1.15, 2.5, 0.58, -9, mats.barrel, 12);
  cyl(0.55, 1.15, -21, 0.58, -10, mats.barrel, 12);
  cyl(0.55, 1.15, 21, 0.58, -10, mats.barrel, 12);

  // ---- signs: map name over each spawn
  const signAtk = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 1.75),
    new THREE.MeshBasicMaterial({ map: makeSignTexture(['EMBER SPAWN', 'attack — plant the charge']), transparent: true }),
  );
  signAtk.position.set(0, 4.6, 19.9);
  signAtk.rotation.y = Math.PI;
  group.add(signAtk);
  const signDef = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 1.75),
    new THREE.MeshBasicMaterial({ map: makeSignTexture(['VANTA SPAWN', 'defend — hold both sites']), transparent: true }),
  );
  signDef.position.set(0, 4.6, -19.9);
  group.add(signDef);

  // ---- distant skyline silhouettes, outside the walls, for depth
  const skylineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#12141a') });
  const skyline = [[-40, 14, 8, -22], [-18, 10, 6, 30], [8, 18, 10, -26], [30, 12, 8, 24], [44, 16, 6, -20], [-48, 12, 10, 26]];
  for (const [x, h, w, z] of skyline) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2), skylineMat);
    b.position.set(x, h / 2 - 1, z * 1.6);
    group.add(b);
  }

  // ---- lights: warm dusk key, cool fill, hemisphere
  const hemi = new THREE.HemisphereLight(new THREE.Color('#8a90a8'), new THREE.Color('#1b1e26'), 1.05);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 2.7);
  key.position.set(18, 26, 14);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -32;
  key.shadow.camera.right = 32;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 80;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#6f86b8'), 0.7);
  fill.position.set(-14, 16, -12);
  scene.add(fill);

  // ---- waypoint graph for the bots
  const N = (id, x, z) => ({ id, pos: new THREE.Vector3(x, 0, z), edges: [] });
  const nodes = [
    N('atkSpawn', 0, 17), N('atkL', -8, 16), N('atkR', 8, 16),
    N('midS', 0, 10), N('mid', 0, 2), N('midN', 0, -6),
    N('aAlley', -12, 6), N('aMid', -14, -4), N('aHold', -14, -10),
    N('aLongS', -24, 12), N('aLongM', -24, 2), N('aLongN', -24, -8),
    N('aSite', -19, -13), N('aBack', -23, -15),
    N('bAlley', 12, 6), N('bMid', 14, -4), N('bHold', 14, -10),
    N('bLongS', 24, 12), N('bLongM', 24, 2), N('bLongN', 24, -8),
    N('bSite', 19, -13), N('bBack', 23, -15),
    N('defSpawn', 0, -17), N('defA', -12, -16), N('defB', 12, -16),
    N('defMid', -6, -14), N('defMid2', 6, -14), N('yardL', -8, 8), N('yardR', 8, 8),
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  function link(a, b) {
    byId.get(a).edges.push(b);
    byId.get(b).edges.push(a);
  }
  link('atkSpawn', 'atkL'); link('atkSpawn', 'atkR'); link('atkSpawn', 'midS');
  link('atkL', 'aAlley'); link('atkR', 'bAlley'); link('atkL', 'aLongS'); link('atkR', 'bLongS');
  link('atkL', 'yardL'); link('atkR', 'yardR');
  link('midS', 'yardL'); link('midS', 'yardR'); link('midS', 'mid');
  link('mid', 'aAlley'); link('mid', 'bAlley'); link('mid', 'midN');
  link('midN', 'defMid'); link('midN', 'defMid2'); link('midN', 'aMid'); link('midN', 'bMid');
  link('aAlley', 'aMid'); link('aMid', 'aHold'); link('aHold', 'aSite');
  link('aLongS', 'aLongM'); link('aLongM', 'aLongN'); link('aLongN', 'aSite'); link('aLongN', 'aBack');
  link('aSite', 'aBack'); link('aSite', 'defA');
  link('bAlley', 'bMid'); link('bMid', 'bHold'); link('bHold', 'bSite');
  link('bLongS', 'bLongM'); link('bLongM', 'bLongN'); link('bLongN', 'bSite'); link('bLongN', 'bBack');
  link('bSite', 'bBack'); link('bSite', 'defB');
  link('defSpawn', 'defA'); link('defSpawn', 'defB'); link('defSpawn', 'defMid'); link('defSpawn', 'defMid2');
  link('defA', 'defMid'); link('defB', 'defMid2'); link('defA', 'aSite'); link('defB', 'bSite');
  link('yardL', 'aAlley'); link('yardR', 'bAlley');

  /** Breadth-first shortest path of node ids from `from` to `to`. */
  function findPath(from, to) {
    if (from === to) return [from];
    const prev = new Map([[from, null]]);
    const queue = [from];
    while (queue.length > 0) {
      const cur = queue.shift();
      for (const next of byId.get(cur).edges) {
        if (prev.has(next)) continue;
        prev.set(next, cur);
        if (next === to) {
          const path = [to];
          let at = cur;
          while (at !== null) {
            path.unshift(at);
            at = prev.get(at);
          }
          return path;
        }
        queue.push(next);
      }
    }
    return [from, to];
  }

  function nearestNode(pos) {
    let best = nodes[0];
    let bestD = Infinity;
    for (const n of nodes) {
      const d = (n.pos.x - pos.x) ** 2 + (n.pos.z - pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best.id;
  }

  const raycaster = new THREE.Raycaster();
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _d = new THREE.Vector3();
  function lineOfSight(a, b, maxDist = 60) {
    _a.copy(a);
    _b.copy(b);
    _d.subVectors(_b, _a);
    const dist = _d.length();
    if (dist > maxDist) return false;
    _d.normalize();
    raycaster.set(_a, _d);
    raycaster.far = dist - 0.05;
    return raycaster.intersectObjects(shootables, false).length === 0;
  }

  const sites = {
    A: { id: 'A', name: 'Furnace', center: new THREE.Vector3(-19, 0, -13), radius: 5 },
    B: { id: 'B', name: 'Silos', center: new THREE.Vector3(19, 0, -13), radius: 5 },
  };

  return {
    group,
    colliders,
    shootables,
    bounds: BOUNDS,
    sites,
    nodes,
    byId,
    findPath,
    nearestNode,
    lineOfSight,
    minimapRects,
    attackerSpawns: [
      new THREE.Vector3(-6, 0, 17.5), new THREE.Vector3(-3, 0, 18), new THREE.Vector3(0, 0, 17.5),
      new THREE.Vector3(3, 0, 18), new THREE.Vector3(6, 0, 17.5),
    ],
    defenderSpawns: [
      new THREE.Vector3(-6, 0, -17.5), new THREE.Vector3(-3, 0, -18), new THREE.Vector3(0, 0, -17.5),
      new THREE.Vector3(3, 0, -18), new THREE.Vector3(6, 0, -17.5),
    ],
    flicker(t) {
      for (const f of flickerLights) f.light.intensity = f.base + Math.sin(t * f.speed) * f.amp * 0.4 + Math.sin(t * f.speed * 2.7) * f.amp * 0.2;
    },
  };
}
