"use client";

import { useEffect, useRef, useState } from "react";
import { useSpotify } from "@/components/useSpotify";
import { useFollow } from "@/components/useFollow";
import { ArtEngine, type EngineStatus } from "@/lib/art-engine";
import type { VibeResponse } from "./api/vibe/route";

const IDLE_MS = 3500;

function fmt(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const Icon = {
  play: <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>,
  pause: <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>,
  wave: <svg className="wave" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">{["M4 10v4", "M8 6v12", "M12 9v6", "M16 4v16", "M20 10v4"].map((d) => <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />)}</svg>,
  full: <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  exit: <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  link: <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ArtEngine | null>(null);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [glError, setGlError] = useState("");

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [song, setSong] = useState<VibeResponse | null>(null);
  const [showEmbed, setShowEmbed] = useState(false);
  const [pictures, setPictures] = useState<string[]>([]);
  const [shown, setShown] = useState<{ cur: string | null; prev: string | null }>({ cur: null, prev: null });
  const [painting, setPainting] = useState(false);
  const pulseRef = useRef<HTMLDivElement>(null);
  const currentTrack = useRef("");
  const [idle, setIdle] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const spotify = useSpotify(false);
  const follow = useFollow();
  const following = follow.connected;
  // Following: time and play state come from the user's own Spotify; otherwise from the embedded player.
  const position = following ? follow.progress : spotify.state.position;
  const duration = following ? follow.now?.durationMs ?? 0 : spotify.state.duration;
  const playing = following ? !!follow.now?.isPlaying : !spotify.state.isPaused;


  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      const e = new ArtEngine(canvasRef.current);
      e.onStatus = setStatus;
      e.pulseEl = pulseRef.current;
      engineRef.current = e;
      return () => e.destroy();
    } catch (err) {
      setGlError(err instanceof Error ? err.message : "This browser can't draw the artwork.");
    }
  }, []);

  useEffect(() => {
    if (engineRef.current) engineRef.current.playingHint = playing;
    if (playing) setShowEmbed(false);
  }, [playing]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), IDLE_MS);
    };
    const evs = ["pointermove", "pointerdown", "keydown", "touchstart"] as const;
    evs.forEach((e) => addEventListener(e, wake, { passive: true }));
    wake();
    return () => { clearTimeout(t); evs.forEach((e) => removeEventListener(e, wake)); };
  }, []);

  useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "f") toggleFull();
    };
    addEventListener("keydown", key);
    return () => { document.removeEventListener("fullscreenchange", on); removeEventListener("keydown", key); };
  }, []);

  function toggleFull() {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el.requestFullscreen) void el.requestFullscreen().catch(() => {});
    else el.webkitRequestFullscreen?.();
  }

  async function toggleMic() {
    const e = engineRef.current;
    if (!e) return;
    setError("");
    if (status?.source === "mic") { e.stopAudio(); return; }
    try { await e.useMic(); } catch { setError("Allow the microphone in your browser's address bar."); }
  }

  function playPause() {
    if (!song) return;
    spotify.toggle();
    // If the browser won't let us start Spotify from here, show its own player to tap.
    if (!spotify.everPlayed) setTimeout(() => setShowEmbed((v) => v || !spotify.everPlayed), 1800);
  }

  // ---- art fetching (shared by "show now" and "get the next song ready") ----
  const vibeCache = useRef(new Map<string, Promise<VibeResponse>>());
  const trackIdOf = (link: string) => link.match(/track[/:]([A-Za-z0-9]{22})/)?.[1] ?? link;

  function fetchVibe(link: string, artist = ""): Promise<VibeResponse> {
    const id = trackIdOf(link);
    const hit = vibeCache.current.get(id);
    if (hit) return hit;
    const p = fetch("/api/vibe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: link, artist }) })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
        return data as VibeResponse;
      });
    vibeCache.current.set(id, p);
    p.catch(() => vibeCache.current.delete(id));
    return p;
  }

  const picKey = (r: VibeResponse) => {
    // Key includes the scenes, so a song whose picture is redesigned gets painted again.
    let h = 0;
    for (const ch of (r.moments ?? []).map((m) => m.scene).join("|")) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return `pics-v3:${r.trackId}:${(h >>> 0).toString(36)}`;
  };
  const preload = (url: string) =>
    new Promise<void>((resolve) => { const img = new Image(); img.onload = img.onerror = () => resolve(); img.src = url; });
  const inflight = useRef(new Map<string, Promise<unknown>>());
  function once<T>(key: string, make: () => Promise<T>): Promise<T> {
    const hit = inflight.current.get(key) as Promise<T> | undefined;
    if (hit) return hit;
    const p = make().finally(() => inflight.current.delete(key));
    inflight.current.set(key, p);
    return p;
  }

  /** The song's picture(s): from this browser's cache, or painted now. Throws a readable message on failure. */
  function getPictures(r: VibeResponse): Promise<string[]> {
    const key = picKey(r);
    return once(key, async () => {
      let cached: string[] = [];
      try { cached = JSON.parse(localStorage.getItem(key) ?? "[]"); } catch {}
      const moments = r.moments ?? [];
      if (cached.length && cached.length >= moments.length) { await preload(cached[0]); return cached; }
      const urls: string[] = [];
      for (const m of moments) {
        const res = await fetch("/api/picture", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trackId: r.trackId, scene: m.scene, sig: m.sig }),
        });
        const data = await res.json();
        if (!res.ok || !data.url) throw new Error(data.problem ?? "A picture couldn't be painted.");
        await preload(data.url);
        urls.push(data.url);
        try { localStorage.setItem(key, JSON.stringify(urls)); } catch {}
      }
      return urls;
    });
  }

  async function paint(r: VibeResponse) {
    setPainting(true);
    try {
      const urls = await getPictures(r);
      if (currentTrack.current === r.trackId && urls.length) setPictures(urls);
    } catch (e) {
      if (currentTrack.current === r.trackId) setError(e instanceof Error ? e.message : "The picture couldn't be painted.");
    } finally {
      if (currentTrack.current === r.trackId) setPainting(false);
    }
  }

  // Get the next song in the Spotify queue ready while this one plays, so the switch is instant.
  const nextId = following ? follow.next?.id ?? "" : "";
  useEffect(() => {
    if (!nextId) return;
    const t = setTimeout(() => {
      void fetchVibe(`https://open.spotify.com/track/${nextId}`, follow.next?.artists ?? "")
        .then((r) => getPictures(r))
        .catch(() => {});
    }, 8000); // wait a little in case people are skipping around
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextId]);


  // When following Spotify, every new song on the user's phone becomes the new song here.
  const followedId = following ? follow.now?.id ?? "" : "";
  useEffect(() => {
    if (!followedId || followedId === currentTrack.current) return;
    void lookUp(`https://open.spotify.com/track/${followedId}`, { artist: follow.now?.artists, fromFollow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followedId]);

  async function lookUp(link: string, opts: { artist?: string; fromFollow?: boolean } = {}) {
    setError("");
    setLoading(true);
    try {
      const r = await fetchVibe(link, opts.artist ?? "");
      setSong(r);
      setUrl("");
      if (!opts.fromFollow) spotify.load(r.trackId);
      engineRef.current?.setArt(r.art, 24 * 3600_000);
      currentTrack.current = r.trackId;
      setPictures([]);
      setShown({ cur: null, prev: null });
      if (engineRef.current) engineRef.current.overlayOn = false;
      void paint(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  // Lyric moments follow the song: split its length evenly across the pictures.
  const momentIdx = pictures.length
    ? Math.min(pictures.length - 1, duration ? Math.floor((position / duration) * pictures.length) : 0)
    : -1;
  const target = momentIdx >= 0 ? pictures[momentIdx] : null;
  useEffect(() => {
    setShown((s) => (s.cur === target ? s : { cur: target, prev: s.cur }));
  }, [target]);

  const artOnScreen = !!shown.cur;
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.overlayOn = artOnScreen;
    engineRef.current.lightsOff = artOnScreen; // no orbs over real photos: just grain and the beat pulse
  }, [artOnScreen]);

  const listening = status?.source === "mic";
  const hide = idle && isFull;
  const pct = duration ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <main className={`app${isFull ? " full" : ""}${hide ? " idle" : ""}`}>
      <section className="stage" aria-label="Artwork">
        <div className="pulse" ref={pulseRef}>
          {shown.prev && <img key={`p-${shown.prev}`} className="picture leaving" src={shown.prev} alt="" />}
          {shown.cur && <img key={`c-${shown.cur}`} className="picture" src={shown.cur} alt="" />}
          <canvas ref={canvasRef} className={`art${shown.cur ? " over" : ""}`} aria-hidden="true" />
        </div>
        {painting && <span className="painting" aria-label="Painting the picture" />}
        {glError && <p className="gl-error">{glError}</p>}
        <header className="stage-top">
          <span className="art-name">{song ? status?.name ?? "" : ""}</span>
          <div className="tools">
            <button type="button" className={`tool${listening ? " on" : ""}`} aria-pressed={listening} aria-label={listening ? "Stop syncing to the beat" : "Sync to the beat"} title="Sync to the beat" onClick={() => void toggleMic()}>{Icon.wave}</button>
            <button type="button" className="tool" aria-label={isFull ? "Exit full screen" : "Full screen"} title="Full screen (F)" onClick={toggleFull}>{isFull ? Icon.exit : Icon.full}</button>
          </div>
        </header>
      </section>

      <footer className="bar" aria-label="Now playing">
        <div className="now">
          <span className="swatch" aria-hidden="true" style={song ? { background: `radial-gradient(circle at 30% 30%, ${song.art.c[3]}, ${song.art.c[2]} 35%, ${song.art.c[1]} 65%, ${song.art.c[0]})` } : undefined} />
          <div className="meta">
            <span className="title">{song?.title ?? "Nothing playing"}</span>
            <span className="artist">{song ? song.artist : following ? "Play something on Spotify" : "Paste a Spotify link"}</span>
          </div>
        </div>

        <div className="transport">
          {!following && (
            <button type="button" className="play" onClick={playPause} disabled={!song} aria-label={playing ? "Pause" : "Play"}>
              {playing ? Icon.pause : Icon.play}
            </button>
          )}
          <div className="progress">
            <span className="time">{fmt(position)}</span>
            <div
              className="track"
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration / 1000)}
              aria-valuenow={Math.round(position / 1000)}
              tabIndex={song ? 0 : -1}
              onClick={(e) => {
                if (!duration || following) return;
                const r = e.currentTarget.getBoundingClientRect();
                spotify.seek(((e.clientX - r.left) / r.width) * (duration / 1000));
              }}
            >
              <div className="fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="time">{duration ? `-${fmt(duration - position)}` : "0:00"}</span>
          </div>
        </div>

        <div className="right">
        {follow.available && (
          following ? (
            <button type="button" className="follow on" onClick={follow.stop} title="Stop following Spotify">
              <span className="dot" aria-hidden="true" /> Following Spotify
            </button>
          ) : (
            <button type="button" className="follow" onClick={follow.start}>Follow Spotify</button>
          )
        )}
        <form className="paste" onSubmit={(e) => { e.preventDefault(); if (url.trim()) void lookUp(url.trim()); }}>
          <label htmlFor="song-url" className="sr-only">Spotify song link</label>
          <span className="paste-icon">{Icon.link}</span>
          <input id="song-url" type="url" inputMode="url" placeholder="Spotify link" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
          {loading && <span className="spin" aria-label="Loading" />}
        </form>
        </div>
        {(error || follow.problem || song?.problem) && <p className="msg" role="alert">{error || follow.problem || song?.problem}</p>}
      </footer>

      <div className={`embed${showEmbed ? " show" : ""}`} ref={spotify.hostRef} aria-hidden={!showEmbed} />
    </main>
  );
}
