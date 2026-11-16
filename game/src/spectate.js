// Death-cam and spectating: when the player goes down, the camera rides with a
// living ally instead of staring at the floor. Click (or press E) to cycle to the
// next living ally; when nobody is left alive the camera stays where the player
// fell. main.js owns when spectating starts and stops; this module owns the
// camera. It never touches the simulation.
export function createSpectate(camera) {
  let active = false;
  let target = null;
  let candidates = [];

  function pickAlive(list, after) {
    const alive = list.filter((c) => c.alive);
    if (!alive.length) return null;
    if (!after) return alive[0];
    const index = alive.findIndex((c) => c === after);
    return alive[(index + 1) % alive.length];
  }

  return {
    get active() {
      return active;
    },
    get target() {
      return target;
    },
    start(list) {
      candidates = list;
      target = pickAlive(list, null);
      active = true;
      return target;
    },
    stop() {
      active = false;
      target = null;
      candidates = [];
    },
    cycle() {
      if (!active) return null;
      target = pickAlive(candidates, target);
      return target;
    },
    refresh(list) {
      candidates = list;
      if (!active) return target;
      if (target && target.alive) return target;
      target = pickAlive(list, target);
      return target;
    },
    // Ride the target's eyes: position at the head, yaw and pitch where the
    // ally looks. Called every frame while spectating.
    update() {
      if (!active || !target || !target.alive) return false;
      camera.position.set(target.pos.x, target.pos.y + 1.6, target.pos.z);
      camera.rotation.set(target.pitch || 0, target.yaw || 0, 0, 'YXZ');
      return true;
    },
  };
}
