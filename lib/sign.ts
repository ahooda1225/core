import { createHmac } from "node:crypto";

/** Signs a scene so /api/picture only paints scenes this site wrote (keeps strangers from spending your Fal credit). */
export function signScene(trackId: string, scene: string): string {
  return createHmac("sha256", process.env.FAL_KEY ?? "no-key").update(`${trackId}\n${scene}`).digest("hex").slice(0, 32);
}

/** The one art style every picture is painted in. Change this to restyle the whole site. */
export const ART_STYLE =
  "Unretouched 35mm color film photograph, the kind a fine-art photographer takes: natural or practical light, real film grain, believable color with gentle film tones (in the spirit of Kodak Portra), honest imperfections, slight softness, true-to-life skin and materials. Restrained and specific, not glossy, not HDR, not oversaturated, not CGI, not illustration. No text or lettering.";
