// Moving-art palettes. Presets for the hand-picked vibes, plus whatever Claude designs per song.
import type { VibeId } from "./vibes";

export interface Palette {
  id: VibeId | "void" | "custom";
  name: string;
  /** How energetic this mood is, 0..1. "Follow music" picks the closest one. */
  e: number;
  /** Light motion: 0 drift, 1 falling snow, 2 rising embers. */
  mode: 0 | 1 | 2;
  /** deep, mid, light, glow */
  c: [string, string, string, string];
  multi?: boolean;
  film?: boolean;
  /** Black stage with a single glow; never picked by "follow music". */
  mono?: boolean;
  /** How fast the artwork flows, 0..1. */
  flow?: number;
  /** How bright the out-of-focus lights are, 0..1. */
  glow?: number;
}

export const PALETTES: Palette[] = [
  { id: "void", name: "Void", e: 0.0, mode: 0, c: ["#000000", "#050505", "#1c1c1c", "#ffffff"], mono: true },
  { id: "fireplace", name: "Fireside", e: 0.1, mode: 2, c: ["#0e0402", "#4a1606", "#e0611c", "#ffc879"] },
  { id: "rain-window", name: "Rain Window", e: 0.17, mode: 0, c: ["#050914", "#14243a", "#4f6f8f", "#ffb46b"] },
  { id: "snowfall", name: "First Snow", e: 0.24, mode: 1, c: ["#08101f", "#22324f", "#8ea3c4", "#ffd6a0"] },
  { id: "fog-drive", name: "Silver Fog", e: 0.34, mode: 0, c: ["#3c4048", "#7d848e", "#cfd3d8", "#c9b79a"] },
  { id: "vintage-film", name: "Red & White", e: 0.42, mode: 0, c: ["#3a0806", "#a3261f", "#efe0cc", "#f0a27a"], film: true },
  { id: "treehouse", name: "Treehouse", e: 0.48, mode: 0, c: ["#1f173a", "#7a4372", "#ee8f52", "#ffd391"] },
  { id: "golden-coast", name: "Golden Hour", e: 0.56, mode: 0, c: ["#231f4f", "#b44e70", "#ffa452", "#fff0c4"] },
  { id: "lights-drive", name: "Lights", e: 0.66, mode: 0, c: ["#07050c", "#2c0f1d", "#9a2a35", "#ffc36b"], multi: true },
  { id: "neon-city", name: "Neon", e: 0.82, mode: 0, c: ["#05020c", "#2d0948", "#ff2bd6", "#22e6ff"], multi: true },
  { id: "club", name: "Club", e: 0.95, mode: 0, c: ["#020104", "#1a0638", "#7b2cff", "#3dffb4"], multi: true },
];

