import { createHmac } from "node:crypto";

/** Signs a scene so /api/picture only paints scenes this site wrote (keeps strangers from spending your Fal credit). */
export function signScene(trackId: string, scene: string): string {
  return createHmac("sha256", process.env.FAL_KEY ?? "no-key").update(`${trackId}\n${scene}`).digest("hex").slice(0, 32);
}

/** The one art style every picture is painted in. Change this to restyle the whole site. */
export const ART_STYLE =
  "Luxury nightlife photography: one bold, saturated colored light (the scene's own color) against deep black shadows, glossy reflections, glamorous and moody, candid like a stylish late-night phone or flash photo or a music-video frame, with motion blur where things move, sparkle and rhinestone highlights, rich saturated color. Realistic photo, not illustration, not CGI, not plastic. No text or lettering.";
