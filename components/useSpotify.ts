"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typings for Spotify's iFrame API
// (https://developer.spotify.com/documentation/embeds/references/iframe-api)
interface PlaybackUpdate {
  isPaused: boolean;
  isBuffering: boolean;
  duration: number; // ms
  position: number; // ms
}
interface EmbedController {
  loadUri(uri: string): void;
  play(): void;
  pause(): void;
  resume(): void;
  seek(seconds: number): void;
  destroy(): void;
  addListener(event: "ready", cb: () => void): void;
  addListener(event: "playback_update", cb: (e: { data: PlaybackUpdate }) => void): void;
}
interface IFrameAPI {
  createController(
    el: HTMLElement,
    options: { uri?: string; width?: string | number; height?: string | number },
    cb: (c: EmbedController) => void,
  ): void;
}
declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: IFrameAPI) => void;
    __spotifyIframeApi?: IFrameAPI;
  }
}

const PREVIEW_MS = 30_000;

function loadApi(): Promise<IFrameAPI> {
  return new Promise((resolve) => {
    if (window.__spotifyIframeApi) return resolve(window.__spotifyIframeApi);
    const prev = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = (api) => {
      window.__spotifyIframeApi = api;
      prev?.(api);
      resolve(api);
    };
    if (!document.querySelector('script[data-spotify-iframe-api]')) {
      const s = document.createElement("script");
      s.src = "https://open.spotify.com/embed/iframe-api/v1";
      s.async = true;
      s.dataset.spotifyIframeApi = "";
      document.body.appendChild(s);
    }
  });
}

export function useSpotify(previewOnly: boolean) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<EmbedController | null>(null);
  const pendingUri = useRef<string | null>(null);
  const previewRef = useRef(previewOnly);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<PlaybackUpdate>({ isPaused: true, isBuffering: false, duration: 0, position: 0 });
  const [everPlayed, setEverPlayed] = useState(false);

  useEffect(() => {
    previewRef.current = previewOnly;
  }, [previewOnly]);

  useEffect(() => {
    let cancelled = false;
    loadApi().then((api) => {
      if (cancelled || !hostRef.current) return;
      const el = document.createElement("div");
      hostRef.current.appendChild(el);
      api.createController(el, { width: "100%", height: 152 }, (c) => {
        controllerRef.current = c;
        c.addListener("ready", () => {
          setReady(true);
          if (pendingUri.current) {
            c.loadUri(pendingUri.current);
            pendingUri.current = null;
          }
        });
        c.addListener("playback_update", ({ data }) => {
          setState(data);
          if (!data.isPaused) setEverPlayed(true);
          if (previewRef.current && !data.isPaused && data.position >= PREVIEW_MS) {
            c.pause();
            c.seek(0);
          }
        });
      });
    });
    return () => {
      cancelled = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, []);

  const load = useCallback((trackId: string) => {
    const uri = `spotify:track:${trackId}`;
    const c = controllerRef.current;
    setEverPlayed(false);
    if (c && ready) {
      c.loadUri(uri);
      // Browsers often block autoplay inside the embed; if so, the viewer taps play on it.
      setTimeout(() => c.play(), 400);
    } else {
      pendingUri.current = uri;
    }
  }, [ready]);

  const toggle = useCallback(() => {
    const c = controllerRef.current;
    if (!c) return;
    if (state.isPaused) c.resume();
    else c.pause();
  }, [state.isPaused]);

  return { hostRef, ready, state, everPlayed, load, toggle, previewMs: PREVIEW_MS };
}
