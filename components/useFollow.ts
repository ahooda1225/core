"use client";

import { useCallback, useEffect, useState } from "react";
import { SPOTIFY_CLIENT_ID, connect, disconnect, finishLoginIfReturning, isConnected, nextInQueue, nowPlaying, type NowPlaying, type QueuedTrack } from "@/lib/spotify-follow";

const POLL_MS = 1500;

/** Follows whatever is playing in the user's Spotify (phone, laptop, speaker). */
export function useFollow() {
  const available = !!SPOTIFY_CLIENT_ID;
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [next, setNext] = useState<QueuedTrack | null>(null);
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
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let wait = POLL_MS;
      try {
        const n = await nowPlaying();
        if (stop) return;
        setNow(n);
        // Check again right as the current song should end, so the switch feels instant.
        if (n?.isPlaying) wait = Math.max(250, Math.min(POLL_MS, n.durationMs - n.progressMs + 250));
      } catch (e) {
        if (e instanceof Error && e.message === "logged-out" && !stop) {
          setConnected(false);
          setNow(null);
          setProblem("Spotify logged out. Click Follow Spotify to log in again.");
          return;
        }
      }
      if (!stop) timer = setTimeout(poll, wait);
    };
    void poll();
    const smooth = setInterval(() => tick((x) => x + 1), 500); // keeps the progress bar moving between polls
    return () => { stop = true; clearTimeout(timer); clearInterval(smooth); };
  }, [connected]);

  // Whenever the song changes, look up what's next in the queue.
  const nowId = now?.id ?? "";
  useEffect(() => {
    if (!connected || !nowId) return;
    let stop = false;
    const look = () => void nextInQueue().then((q) => { if (!stop) setNext(q && q.id !== nowId ? q : null); }).catch(() => {});
    const first = setTimeout(look, 4000); // give a skip a moment to settle
    const again = setInterval(look, 30000); // the queue can change while a song plays
    return () => { stop = true; clearTimeout(first); clearInterval(again); };
  }, [connected, nowId]);

  const start = useCallback(() => { setProblem(""); void connect(); }, []);
  const stop = useCallback(() => { disconnect(); setConnected(false); setNow(null); }, []);

  const progress = now ? Math.min(now.durationMs, now.progressMs + (now.isPlaying ? Date.now() - now.at : 0)) : 0;
  return { available, connected, now, next, progress, problem, start, stop };
}
