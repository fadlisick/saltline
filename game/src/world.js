// Kestrel Yard: a 48 x 36 m rail yard, three lanes, two bomb sites. Every box is a
// collider for players and bots and a surface a bullet stops on. Plain geometry only,
// no models and no textures. Sites are marked by a coloured floor plate and a beacon.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// [width, height, depth, x, y, z, material] — y is the box centre.
const BOXES = [
  // Floor and perimeter walls (5 m high, open to the dusk sky).
  [48.4, 0.4, 36.4, 0, -0.2, 0, 'canvas'],
  [0.4, 5, 36.4, -24.2, 2.5, 0, 'surface'],
  [0.4, 5, 36.4, 24.2, 2.5, 0, 'surface'],
  [48.4, 5, 0.4, 0, 2.5, -18.2, 'surface'],
  [48.4, 5, 0.4, 0, 2.5, 18.2, 'surface'],
  // Mid lane crates: the central corridor, cover every few metres.
  [1.2, 1.1, 1.2, -1.8, 0.55, 6, 'hairline'],
  [1.2, 1.1, 1.2, 2.2, 0.55, 2, 'rust'],
  [1.2, 1.1, 3.6, -2.4, 0.55, -3, 'hairline'],
  [1.2, 1.1, 1.2, 2.6, 0.55, -7, 'rust'],
  // Central plaza: a container stack and a pillar split the sightline to both sites.
  [6, 2.6, 2.6, 0, 1.3, -11, 'rust'],
  [1.2, 3.4, 1.2, -6, 1.7, -11, 'hairline'],
  [1.2, 3.4, 1.2, 6, 1.7, -11, 'hairline'],
  // A-long (west lane): containers and low walls, a corner at the site mouth.
  [6, 2.6, 2.6, -18, 1.3, 4, 'rust'],
  [3.6, 1.1, 1.2, -14, 0.55, 0, 'hairline'],
  [1.2, 1.1, 3.6, -20, 0.55, -4, 'hairline'],
  [2.4, 0.9, 1.2, -15, 0.45, -8, 'hairline'],
  [1.6, 1.6, 1.6, -21, 0.8, -11, 'rust'],
  // B lane (east lane): mirrored cover, a different rhythm of corners.
  [6, 2.6, 2.6, 18, 1.3, 4, 'rust'],
  [1.2, 1.1, 3.6, 14, 0.55, 0, 'hairline'],
  [3.6, 1.1, 1.2, 20, 0.55, -4, 'hairline'],
  [1.2, 1.1, 1.2, 15, 0.55, -8, 'rust'],
  [1.6, 1.6, 1.6, 21, 0.8, -11, 'rust'],
  // Site backstops and spawn cover.
  [7, 2.6, 1.2, -17, 1.3, -16.4, 'surface'],
  [7, 2.6, 1.2, 17, 1.3, -16.4, 'surface'],
  [2.4, 0.9, 1.2, -4, 0.45, 14, 'hairline'],
  [2.4, 0.9, 1.2, 4, 0.45, 14, 'hairline'],
  // Connector (east of mid): a covered shortcut from mid to B, with crates to
  // fight around instead of a bare corridor. The lurker's lane.
  [1.2, 1.1, 1.2, 9, 0.55, -6, 'rust'],
  [1.2, 1.1, 3.6, 9, 0.55, -11, 'hairline'],
  [2.4, 0.9, 1.2, 12, 0.45, -8.5, 'rust'],
];

// Waypoint graph for the bots. Nodes are {x, z}; edges are explicit so a bot never
// tries to walk through a container. Routes run spawn -> lane -> site.
const NODES = {
  AS: [0, 15], ASW: [-8, 13], ASE: [8, 13],
  MID1: [0, 8], MID2: [0, 0], MID3: [0, -6], MID4: [0, -11],
  AW1: [-14, 10], AW2: [-19, 4], AW3: [-19, -4], AW4: [-17, -9],
  AE1: [14, 10], AE2: [19, 4], AE3: [19, -4], AE4: [17, -9],
  SA: [-17, -12], SB: [17, -12],
  CN1: [7, -6], CN2: [7, -11],
  DS: [0, -15], DSW: [-8, -14], DSE: [8, -14],
  DA1: [-13, -12], DA2: [-20, -14], DB1: [13, -12], DB2: [20, -14], DM: [0, -14],
};
const EDGES = {
  AS: ['ASW', 'ASE', 'MID1'], ASW: ['AS', 'AW1'], ASE: ['AS', 'AE1'],
  MID1: ['AS', 'MID2'], MID2: ['MID1', 'MID3'], MID3: ['MID2', 'MID4'],
  MID4: ['MID3', 'DM', 'SA', 'SB'],
  CN1: ['MID3', 'CN2'], CN2: ['CN1', 'SB', 'DB1'],
  AW1: ['ASW', 'AW2'], AW2: ['AW1', 'AW3'], AW3: ['AW2', 'AW4'], AW4: ['AW3', 'SA', 'DA1'],
  AE1: ['ASE', 'AE2'], AE2: ['AE1', 'AE3'], AE3: ['AE2', 'AE4'], AE4: ['AE3', 'SB', 'DB1'],
  SA: ['AW4', 'MID4', 'DA1', 'DA2'], SB: ['AE4', 'MID4', 'DB1', 'DB2', 'CN2'],
  DS: ['DSW', 'DSE', 'DM'], DSW: ['DS', 'DA1'], DSE: ['DS', 'DB1'],
  DA1: ['DSW', 'SA', 'AW4'], DA2: ['SA'], DB1: ['DSE', 'SB', 'AE4', 'CN2'], DB2: ['SB'],
  DM: ['DS', 'MID4'],
};

export const SITES = {
  A: { x: -17, z: -12, r: 3.6 },
  B: { x: 17, z: -12, r: 3.6 },
};
export const SPAWNS = {
  vanguard: [[-4, 15], [-2, 16], [0, 15], [2, 16], [4, 15]],
  sentinel: [[-4, -15], [-2, -16], [0, -15], [2, -16], [4, -15]],
};
// Fixed routes attackers take, and the holds defenders start on.
export const ROUTES = {
  A: ['AS', 'ASW', 'AW1', 'AW2', 'AW3', 'AW4', 'SA'],
  B: ['AS', 'ASE', 'AE1', 'AE2', 'AE3', 'AE4', 'SB'],
  MID: ['AS', 'MID1', 'MID2', 'MID3', 'MID4'],
  CONN: ['AS', 'MID1', 'MID2', 'MID3', 'CN1', 'CN2', 'SB'],
};
export const HOLDS = {
  A: ['DA1', 'DA2', 'DM'],
  B: ['DB1', 'DB2', 'DM'],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const colliders = [];
  const shootables = [];
  function box(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  for (const args of BOXES) box(...args);

  // Site plates: flat markers, not colliders, so feet stay on the floor.
  function plate(site, material) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(7, 0.06, 7),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[material]), roughness: 0.6, emissive: new THREE.Color(PALETTE[material]), emissiveIntensity: 0.35 }),
    );
    mesh.position.set(site.x, 0.03, site.z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  plate(SITES.A, 'vanguard');
  plate(SITES.B, 'sentinel');

  // Site beacons: a pole and a glowing tip so a site reads from across the map.
  function beacon(site, material) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.4, 0.18), materials.hairline);
    pole.position.set(site.x, 2.2, site.z - 3.2);
    pole.castShadow = true;
    group.add(pole);
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE[material]) }),
    );
    tip.position.set(site.x, 4.6, site.z - 3.2);
    group.add(tip);
    const light = new THREE.PointLight(new THREE.Color(PALETTE[material]), 6, 12);
    light.position.set(site.x, 4.4, site.z - 3.2);
    group.add(light);
  }
  beacon(SITES.A, 'vanguard');
  beacon(SITES.B, 'sentinel');

  // Dusk light: a low warm sun, a cool sky fill, and a hemisphere gradient.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#8a97ad'), new THREE.Color('#1a1712'), 0.9));
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb36b'), 2.4);
  sun.position.set(-18, 16, 14);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5f7ea6'), 0.5);
  fill.position.set(14, 10, -12);
  scene.add(fill);

  return { colliders, shootables, group };
}

// Breadth-first route through the waypoint graph, from one node to another.
export function findRoute(from, to) {
  if (from === to) return [to];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const node = queue.shift();
    for (const next of EDGES[node] || []) {
      if (!(next in prev)) {
        prev[next] = node;
        if (next === to) {
          const path = [to];
          let at = to;
          while (prev[at]) { at = prev[at]; path.unshift(at); }
          return path;
        }
        queue.push(next);
      }
    }
  }
  return [to];
}

export function nearestNode(x, z) {
  let best = 'AS';
  let bestD = Infinity;
  for (const [id, [nx, nz]] of Object.entries(NODES)) {
    const d = (nx - x) ** 2 + (nz - z) ** 2;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

export function nodePosition(id) {
  const [x, z] = NODES[id];
  return { x, z };
}
