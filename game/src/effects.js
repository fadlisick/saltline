// Transient effects, all pooled: tracer lines, impact sparks and the grenade blast.
// Nothing is allocated in the hot loop — a pool slot is reused, fades, and waits.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 24;
const SPARKS = 8;
const SPARK_POINTS = 14;

export function createEffects(scene) {
  const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;

  const sparkMat = new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.09, transparent: true, opacity: 0.95, sizeAttenuation: true });
  const sparks = [];
  for (let i = 0; i < SPARKS; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_POINTS * 3), 3));
    const points = new THREE.Points(geometry, sparkMat.clone());
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    sparks.push({ points, life: 0, velocities: new Float32Array(SPARK_POINTS * 3) });
  }
  let sparkNext = 0;

  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
  );
  blast.visible = false;
  scene.add(blast);
  let blastLife = 0;

  const tmp = new THREE.Vector3();

  return {
    tracer(from, to, enemy) {
      const slot = tracers[tracerNext];
      tracerNext = (tracerNext + 1) % TRACERS;
      const attr = slot.line.geometry.getAttribute('position');
      attr.setXYZ(0, from.x, from.y, from.z);
      attr.setXYZ(1, to.x, to.y, to.z);
      attr.needsUpdate = true;
      slot.line.material.color.set(enemy ? PALETTE.danger : PALETTE.accent);
      slot.line.material.opacity = 0.9;
      slot.line.visible = true;
      slot.life = 0.07;
    },
    sparksAt(point, random) {
      const slot = sparks[sparkNext];
      sparkNext = (sparkNext + 1) % SPARKS;
      const attr = slot.points.geometry.getAttribute('position');
      for (let i = 0; i < SPARK_POINTS; i += 1) {
        attr.setXYZ(i, point.x, point.y, point.z);
        slot.velocities[i * 3] = (random() * 2 - 1) * 3;
        slot.velocities[i * 3 + 1] = random() * 3.5;
        slot.velocities[i * 3 + 2] = (random() * 2 - 1) * 3;
      }
      attr.needsUpdate = true;
      slot.points.material.opacity = 0.95;
      slot.points.visible = true;
      slot.life = 0.35;
    },
    explosion(point) {
      blast.position.copy(point);
      blast.scale.setScalar(0.4);
      blast.material.opacity = 0.85;
      blast.visible = true;
      blastLife = 0.45;
    },
    step(dt) {
      for (const slot of tracers) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        slot.line.material.opacity = Math.max(0, slot.life / 0.07) * 0.9;
        if (slot.life <= 0) slot.line.visible = false;
      }
      for (const slot of sparks) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        const attr = slot.points.geometry.getAttribute('position');
        for (let i = 0; i < SPARK_POINTS; i += 1) {
          attr.array[i * 3] += slot.velocities[i * 3] * dt;
          attr.array[i * 3 + 1] += slot.velocities[i * 3 + 1] * dt;
          attr.array[i * 3 + 2] += slot.velocities[i * 3 + 2] * dt;
          slot.velocities[i * 3 + 1] -= 12 * dt;
          if (attr.array[i * 3 + 1] < 0.02) attr.array[i * 3 + 1] = 0.02;
        }
        attr.needsUpdate = true;
        slot.points.material.opacity = Math.max(0, slot.life / 0.35) * 0.95;
        if (slot.life <= 0) slot.points.visible = false;
      }
      if (blastLife > 0) {
        blastLife -= dt;
        tmp.setScalar(0.4 + (0.45 - blastLife) * 14);
        blast.scale.copy(tmp);
        blast.material.opacity = Math.max(0, blastLife / 0.45) * 0.85;
        if (blastLife <= 0) blast.visible = false;
      }
    },
  };
}
