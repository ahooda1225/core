/** Pull the track id out of a Spotify link or URI. Returns null if it isn't a track. */
export function parseTrackId(input: string): string | null {
  const s = input.trim();
  const uri = s.match(/^spotify:track:([A-Za-z0-9]{22})$/);
  if (uri) return uri[1];
  try {
    const url = new URL(s);
    if (!/(^|\.)spotify\.com$/.test(url.hostname)) return null;
    // Handles /track/ID, /intl-xx/track/ID, /embed/track/ID
    const m = url.pathname.match(/\/track\/([A-Za-z0-9]{22})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
