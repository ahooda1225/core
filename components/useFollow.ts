"use client";

import { useCallback, useEffect, useState } from "react";
import { SPOTIFY_CLIENT_ID, connect, disconnect, finishLoginIfReturning, isConnected, nowPlaying, type NowPlaying } from "@/lib/spotify-follow";

const POLL_MS = 3000;

/** Follows whatever is playing in the user's Spotify (phone, laptop, speaker). */
export function useFollow() {
  const available = !!SPOTIFY_CLIENT_ID;
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [problem, setProblem] = useState("");
  const [, tick] = useState(0);

  useEffect(() => {
    if (!available) return;
    void finishLoginIfReturning().then((err) => {
      if (err) setProblem(err);
      setConnected(isConnected());
    });
  }, [available]);

  useEffect(() => {
    if (!connected) return;
    let stop = false;
    const poll = async () => {
      try {
        const n = await nowPlaying();
        if (!stop) setNow(n);
      } catch (e) {
        if (e instanceof Error && e.message === "logged-out" && !stop) {
          setConnected(false);
          setNow(null);
          setProblem("Spotify logged out. Click Follow Spotify to log in again.");
        }
      }
    };
    void poll();
    const id = setInterval(poll, POLL_MS);
    const smooth = setInterval(() => tick((x) => x + 1), 500); // keeps the progress bar moving between polls
    return () => { stop = true; clearInterval(id); clearInterval(smooth); };
  }, [connected]);

  const start = useCallback(() => { setProblem(""); void connect(); }, []);
  const stop = useCallback(() => { disconnect(); setConnected(false); setNow(null); }, []);

  const progress = now ? Math.min(now.durationMs, now.progressMs + (now.isPlaying ? Date.now() - now.at : 0)) : 0;
  return { available, connected, now, progress, problem, start, stop };
}
