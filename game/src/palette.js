// The look plan, in one place. One palette drives the 3D scene and the DOM: dusk
// concrete, rust steel, and two team hues — amber for Vanguard (attack), teal for
// Sentinel (defence). No other colour appears in the code.
export const PALETTE = {
  canvas: '#161a20',
  surface: '#22262e',
  hairline: '#333a45',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
  vanguard: '#f0a830',
  sentinel: '#3fb8a6',
  rust: '#a4552f',
  danger: '#d84a35',
};

export function shade(name) {
  return PALETTE[name];
}
