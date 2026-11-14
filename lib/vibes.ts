// The vibe library. Every song gets mapped to one or more of these scenes.
// Each scene plays /public/vibes/<id>.mp4 if that file exists, otherwise a
// code-drawn animated loop (see lib/scenes.ts).

export const VIBE_IDS = [
  "snowfall",
  "lights-drive",
  "fireplace",
  "neon-city",
  "fog-drive",
  "golden-coast",
  "rain-window",
  "club",
  "treehouse",
  "vintage-film",
] as const;

export type VibeId = (typeof VIBE_IDS)[number];

export interface Vibe {
  id: VibeId;
  name: string;
  /** Default caption location, shown bottom-left on the viewfinder. */
  place: string;
  /** Default time of day for the date stamp, e.g. "1:47 AM". */
  time: string;
  /** What the scene shows. Claude reads this to pick a vibe. */
  description: string;
  /** Camera look: cheap digicam (default) or old film camera. */
  look?: "digicam" | "film";
}

export const VIBES: Record<VibeId, Vibe> = {
  snowfall: {
    id: "snowfall",
    name: "First Snow",
    place: "empty street, first snow",
    time: "11:48 PM",
    description:
      "First-person POV standing still on a quiet residential street at night while heavy snow falls under a single streetlamp. Deep, touching, nostalgic, a little lonely.",
  },
  "lights-drive": {
    id: "lights-drive",
    name: "Lights Drive",
    place: "slow drive, christmas lights",
    time: "8:12 PM",
    description:
      "POV from a car slowly rolling through a suburban neighborhood looking at houses covered in Christmas lights. Warm, cozy, wistful, holiday nostalgia.",
  },
  fireplace: {
    id: "fireplace",
    name: "Fireside",
    place: "living room, fire going",
    time: "10:05 PM",
    description:
      "Sitting near a crackling fireplace in a dark room, snow outside the window. Warm, intimate, safe, reflective.",
  },
  "neon-city": {
    id: "neon-city",
    name: "Neon City",
    place: "district 9, upper level",
    time: "2:31 AM",
    description:
      "A futuristic megacity at night: neon signs, rain, flying traffic, wet reflective streets. Dark synth, cinematic, hedonistic, cold.",
  },
  "fog-drive": {
    id: "fog-drive",
    name: "Silver Fog",
    place: "backroad, morning fog",
    time: "6:47 AM",
    description:
      "Gloomy silver morning, thick fog and dew on the windshield, cruising slow in a tinted trap car. Driver with a face tattoo visible in the rearview mirror. Moody, heavy, rap/trap energy.",
  },
  "golden-coast": {
    id: "golden-coast",
    name: "Golden Coast",
    place: "coast highway pullout",
    time: "7:22 PM",
    description:
      "Golden-hour sunset over the ocean with palm silhouettes. Warm, carefree, summer, romantic, feel-good.",
  },
  "rain-window": {
    id: "rain-window",
    name: "Rain Window",
    place: "bedroom, rain on glass",
    time: "3:14 AM",
    description:
      "Looking out a rain-streaked bedroom window at blurry city lights late at night. Lo-fi, sad, introspective, heartbreak.",
  },
  club: {
    id: "club",
    name: "Basement Club",
    place: "basement, no phones",
    time: "1:09 AM",
    description:
      "A dark packed club with laser beams sweeping through haze and a crowd moving. High energy, dance, hype, party.",
  },
  treehouse: {
    id: "treehouse",
    name: "Treehouse",
    place: "treehouse, feet hanging out",
    time: "7:38 PM",
    description:
      "Chilling inside a wooden treehouse in the evening, looking out the doorway over the trees, kicking your feet. Easygoing, warm, carefree, a little dreamy.",
  },
  "vintage-film": {
    id: "vintage-film",
    name: "Red & White",
    place: "home movie, reel 2",
    time: "4:56 PM",
    look: "film",
    description:
      "Watching an old home-video film reel in red and white: a ginger girl turning toward the camera, warm faded film, flicker and scratches. Sweet, romantic, nostalgic, vintage.",
  },
};
