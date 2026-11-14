import type { VibeId } from "./vibes";

// Songs you've hand-picked vibes for. They skip Claude and always get these vibes.
// They're also shown to Claude as examples of your taste.
// `vibes` is ordered: the first one plays first, "next scene" cycles the rest.

export interface PinnedSong {
  /** Spotify track id (the part after /track/ in the link). Matches even when the title is unknown. */
  trackId?: string;
  title: string;
  artist: string;
  /** Spotify track link (Share → Copy Song Link). Needed for the quick-pick chip to play. */
  spotifyUrl?: string;
  vibes: VibeId[];
  /** Your own words for the vibe. */
  note: string;
}

export const PINNED_SONGS: PinnedSong[] = [
  {
    trackId: "3H6xZgwRZx8McVUJzmMxWe",
    title: "Headphones On",
    artist: "Addison Rae",
    spotifyUrl: "https://open.spotify.com/track/3H6xZgwRZx8McVUJzmMxWe",
    vibes: ["golden-coast"],
    note: "Light and outside, daytime. Wind blowing, carefree, wired headphones with the cord swinging in the breeze. Bright and airy, not night or neon.",
  },
  {
    trackId: "754kgU5rWscRTfvlsuEwFp",
    title: "", // TODO: fill in the title/artist (not needed for matching, but helps Claude learn your taste)
    artist: "",
    spotifyUrl: "https://open.spotify.com/track/754kgU5rWscRTfvlsuEwFp",
    vibes: ["treehouse", "vintage-film"],
    note: "Treehouse, chilling, kicking feet, inside looking out, it's evening. Or red and white, watching a vintage kind of video, she's ginger, like a film camera.",
  },
  {
    title: "Gasoline",
    artist: "The Weeknd",
    vibes: ["neon-city", "fog-drive"],
    note: "Somewhere futuristic. Or a gloomy, foggy, silver morning-dew sky, driving a trap car, the driver has a face tat.",
  },
  // TODO: song with the lyric "something bout u that now i can't remember, it's the same damn thing".
  // Fill in title/artist and it'll be pinned to these vibes:
  // {
  //   title: "",
  //   artist: "",
  //   vibes: ["snowfall", "lights-drive", "fireplace"],
  //   note: "First-person, hyperreal, snowfall, something deep and touching. Or driving through a neighborhood looking at Christmas lights. Or near a fireplace.",
  // },
];

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findPinned(trackId: string, title: string, artist?: string): PinnedSong | undefined {
  const byId = PINNED_SONGS.find((s) => s.trackId === trackId);
  if (byId) return byId;
  const t = normalize(title);
  if (!t) return undefined;
  return PINNED_SONGS.find((s) => {
    if (!s.title) return false;
    if (normalize(s.title) !== t) return false;
    if (artist && normalize(artist) && normalize(s.artist) !== normalize(artist)) return false;
    return true;
  });
}
