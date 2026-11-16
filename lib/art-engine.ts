// The art screen: a WebGL color field with soft out-of-focus lights, driven by
// whatever the room is hearing (mic) or a song file. Framework-free so it can
// run anywhere; the React component in components/ArtScreen.tsx drives it.


import { PALETTES, type Palette } from "./palettes";
export { PALETTES, type Palette };

const VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
const FS = `
precision highp float;
uniform vec2 res; uniform float t, energy, pulse, mode, multi, film, mono, glow, overlay, lights;
uniform vec3 c0, c1, c2, c3;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return v; }
vec3 hue(float x){ return .55+.45*cos(6.2831*(x+vec3(0.,.33,.67))); }
void main(){
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = (gl_FragCoord.xy - .5*res) / res.y;
  float tt = t * .045;
  vec2 q = vec2(fbm(p*1.3 + tt), fbm(p*1.3 - tt + 4.1));
  vec2 r = vec2(fbm(p*1.1 + 2.2*q + vec2(1.7, 9.2) + tt*.7), fbm(p*1.1 + 2.2*q + vec2(8.3, 2.8) - tt*.6));
  float f = fbm(p*1.2 + 2.6*r);
  float vert = smoothstep(-.6, .7, p.y);
  vec3 col = mix(c0, c1, smoothstep(.15, .75, f + vert*.25));
  col = mix(col, c2, smoothstep(.55, 1.05, f*f*1.6 + r.x*.25));
  col += c3 * .18 * smoothstep(.6, 1., r.y);
  // the void: one soft white glow that breathes with the beat
  float rr = length(p - vec2(0., .02));
  float halo = exp(-rr*rr*(26. - 8.*pulse)) * (.32 + .12*energy + .3*pulse);
  float rim = exp(-pow((rr - .085) * 38., 2.)) * (.35 + .4*pulse);
  float core = smoothstep(.088, .082, rr);
  vec3 voidCol = (vec3(halo) + vec3(rim)) * vec3(.94, .95, 1.) * (1. - core);
  vec3 b = vec3(0.);
  for (int i = 0; i < 26; i++) {
    float fi = float(i);
    float s1 = h(vec2(fi, 1.3)), s2 = h(vec2(fi, 7.9)), s3 = h(vec2(fi, 3.1));
    vec2 c;
    if (mode < .5) c = vec2(s1*2.2-1.1 + .08*sin(t*.07 + fi), s2*1.2-.6 + .05*cos(t*.05 + fi*1.7));
    else if (mode < 1.5) c = vec2(s1*2.2-1.1 + .04*sin(t*.3 + fi), .65 - fract(s2 + t*(.015 + .02*s3)) * 1.3);
    else c = vec2(s1*.9-.45 + .05*sin(t*.4 + fi), -.6 + fract(s2 + t*(.03 + .04*s3)) * 1.25);
    float size = mode > 1.5 ? .008 + .02*s3 : mode > .5 ? .01 + .035*s3*s3 : .03 + .09*s3;
    float d = length(p - c);
    float disc = smoothstep(size, size*.55, d) * (.55 + .45*smoothstep(size*.5, size*.95, d));
    float tw = .55 + .45*sin(t*(.3 + s1) + fi*2.1);
    vec3 bc = multi > .5 ? mix(c3, hue(s2), .7) : mix(c3, c2, s1*.6);
    float life = mode > 1.5 ? smoothstep(.65, -.2, c.y) : 1.;
    b += bc * disc * tw * life * (.35 + .4*energy) * (.3 + 1.4*glow);
  }
  col += b * (1. + pulse*.6);
  col += c3 * .12 * pulse * smoothstep(1.2, 0., length(p - vec2(.3, .25)));
  col *= .92 + .16*energy;
  if (film > .5) { col = mix(col, col*vec3(1.08,.96,.82), .6); col = col*.88 + .06; col *= .94 + .06*h(vec2(floor(t*18.), 2.)); }
  col = col / (1. + col*.35) * 1.18;
  col *= mix(.5, 1., smoothstep(1.15, .25, length((uv-.5)*vec2(1.25, 1.))));
  col = mix(col, voidCol, mono);
  float g = h(gl_FragCoord.xy + fract(t*7.)*100.) - .5;
  // over a painted picture: only the lights, the beat bloom and grain (screen-blended by CSS)
  vec3 lightsOnly = b * lights * (1. + pulse*.6) * .8 + c3 * .1 * pulse * smoothstep(1.2, 0., length(p - vec2(.3, .25))) + abs(g) * .05;
  col = mix(col, lightsOnly, overlay);
  col += g * (film > .5 ? .07 : .045);
  gl_FragColor = vec4(col, 1.);
}`;

const hex = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];

export type Source = "none" | "mic" | "file";

export interface EngineStatus {
  source: Source;
  energy: number; // fast, 0..1
  mood: number; // slow, 0..1
  bpm: number;
  palette: Palette["id"];
  name: string;
}

export class ArtEngine {
  private gl: WebGLRenderingContext;
  private canvas: HTMLCanvasElement;
  private U: Record<string, WebGLUniformLocation | null> = {};
  private raf = 0;
  private T = 40;
  private last = performance.now();
  private reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  private active: Palette = PALETTES[0]; // start in the void
  private cur = { c: PALETTES[0].c.map(hex), mode: 0, multi: 0, film: 0, mono: 1, flow: 0.5, glow: 0.5, overlay: 0 };
  private from: { c: number[][]; mono: number; flow: number; glow: number; start: number } | null = null;

  follow = true;
  private holdUntil = 0;
  private lastSwitch = -1e9;
  private lastFollow = 0;
  /** Extra activity when we know music is playing but can't hear it (no mic). */
  playingHint = false;
  /** When a painted picture is showing, draw only lights and grain on top of it. */
  overlayOn = false;
  /** Hide the soft out-of-focus lights (keeps grain and the beat pulse). */
  lightsOff = false;
  /** Element that gets the beat zoom (defaults to the canvas). */
  pulseEl: HTMLElement | null = null;

  private ac: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private srcNode: AudioNode | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private source: Source = "none";
  private freq = new Uint8Array(512);
  private wave = new Uint8Array(1024);
  private L = { fast: 0, mood: 0.2, bassAvg: 0, bassPeak: 0.2, rmsPeak: 0.05, lastBeat: 0, beats: [] as number[], bpm: 0, pulse: 0, centroid: 0 };

  onStatus?: (s: EngineStatus) => void;
  private statusTick = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { antialias: false });
    if (!gl) throw new Error("WebGL is not available in this browser.");
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const k of ["res", "t", "energy", "pulse", "mode", "multi", "film", "mono", "glow", "overlay", "lights", "c0", "c1", "c2", "c3"]) this.U[k] = gl.getUniformLocation(prog, k);
    this.resize = this.resize.bind(this);
    addEventListener("resize", this.resize);
    this.resize();
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    removeEventListener("resize", this.resize);
    this.stopAudio();
    this.ac?.close();
  }

  private resize() {
    const k = Math.min(1, 1100 / Math.max(innerWidth, 1)) * Math.min(devicePixelRatio, 1.5);
    this.canvas.width = Math.round(innerWidth * k);
    this.canvas.height = Math.round(innerHeight * k);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Switch mood. `holdMs` keeps "follow music" from moving off it for a while. */
  setPalette(id: Palette["id"], holdMs = 0) {
    const p = PALETTES.find((x) => x.id === id);
    if (p) this.setArt(p, holdMs);
  }

  /** Show any artwork: a preset or one Claude designed for the song. `holdMs` pauses "follow music". */
  setArt(p: Palette, holdMs = 0) {
    if (holdMs) this.holdUntil = performance.now() + holdMs;
    if (p === this.active) return;
    this.from = { c: this.cur.c.map((x) => x.slice()), mono: this.cur.mono, flow: this.cur.flow, glow: this.cur.glow, start: performance.now() };
    this.active = p;
    this.lastSwitch = performance.now();
    this.emit(true);
  }

  // ---------- audio ----------
  private ensureCtx() {
    if (!this.ac) {
      this.ac = new AudioContext();
      this.analyser = this.ac.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.6;
    }
    if (this.ac.state === "suspended") void this.ac.resume();
    return this.ac;
  }

  stopAudio() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.audioEl) { this.audioEl.pause(); this.audioEl.src = ""; this.audioEl = null; }
    try { this.srcNode?.disconnect(); } catch {}
    try { this.analyser?.disconnect(); } catch {}
    this.srcNode = null;
    this.source = "none";
    this.emit(true);
  }

  /** Listen to the room. Must be called from a click. */
  async useMic() {
    const ac = this.ensureCtx();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.stopAudio();
    this.stream = stream;
    const src = ac.createMediaStreamSource(stream);
    const boost = ac.createGain();
    boost.gain.value = 2.5; // room sound is quieter than a direct feed
    src.connect(boost).connect(this.analyser!); // not to the speakers: no feedback
    this.srcNode = src;
    this.source = "mic";
    this.emit(true);
  }

  /** Play a song file from the device. Must be called from a click. */
  async useFile(file: File) {
    const ac = this.ensureCtx();
    this.stopAudio();
    const el = new Audio(URL.createObjectURL(file));
    el.loop = true;
    const src = ac.createMediaElementSource(el);
    src.connect(this.analyser!);
    this.analyser!.connect(ac.destination);
    this.srcNode = src;
    this.audioEl = el;
    this.source = "file";
    await el.play();
    this.emit(true);
  }

  private listen(now: number) {
    const L = this.L;
    if (this.source === "none" || !this.analyser) {
      const target = this.playingHint ? 0.45 : 0.15;
      L.fast += (target - L.fast) * 0.02;
      L.pulse *= 0.9;
      return;
    }
    this.analyser.getByteFrequencyData(this.freq);
    this.analyser.getByteTimeDomainData(this.wave);
    let sum = 0;
    for (let i = 0; i < this.wave.length; i++) { const v = (this.wave[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / this.wave.length);
    let bass = 0;
    for (let i = 1; i < 8; i++) bass += this.freq[i];
    bass /= 7 * 255;
    let num = 0, den = 0;
    for (let i = 0; i < this.freq.length; i++) { num += i * this.freq[i]; den += this.freq[i]; }
    const centroid = den ? num / den / this.freq.length : 0;
    L.centroid += (centroid - L.centroid) * 0.05;
    // slow auto-gain so a quiet room and a loud speaker both read well
    L.bassPeak = Math.max(bass, L.bassPeak * 0.9995, 0.08);
    L.rmsPeak = Math.max(rms, L.rmsPeak * 0.9995, 0.02);
    const b = bass / L.bassPeak;
    L.bassAvg += (b - L.bassAvg) * 0.05;
    if (b > L.bassAvg * 1.22 && b > 0.45 && now - L.lastBeat > 280) {
      L.lastBeat = now;
      L.pulse = 1;
      L.beats.push(now);
    }
    while (L.beats.length && now - L.beats[0] > 8000) L.beats.shift();
    L.pulse *= 0.88;
    if (L.beats.length > 4) {
      const iv: number[] = [];
      for (let i = 1; i < L.beats.length; i++) iv.push(L.beats[i] - L.beats[i - 1]);
      iv.sort((a, z) => a - z);
      let bpm = 60000 / iv[Math.floor(iv.length / 2)];
      while (bpm < 70) bpm *= 2;
      while (bpm > 180) bpm /= 2;
      L.bpm += (bpm - L.bpm) * 0.1;
    } else L.bpm *= 0.995;
    const density = Math.min(1, L.beats.length / 8 / 2.2);
    const loud = Math.min(1, rms / L.rmsPeak) * Math.min(1, L.rmsPeak / 0.06);
    const bright = Math.min(1, Math.max(0, (L.centroid - 0.04) / 0.16));
    const energy = 0.4 * loud + 0.35 * density + 0.25 * bright;
    L.fast += (energy - L.fast) * 0.08;
    L.mood += (energy - L.mood) * 0.004;
  }

  private followMusic(now: number) {
    if (!this.follow || this.source === "none" || now < this.holdUntil) return;
    let best = 1, d = 9;
    PALETTES.forEach((p, i) => { if (p.mono) return; const dd = Math.abs(p.e - this.L.mood); if (dd < d) { d = dd; best = i; } });
    if (PALETTES[best] !== this.active && now - this.lastSwitch > 20000) this.setArt(PALETTES[best]);
  }

  private stepPalette(now: number) {
    const v = this.active;
    const target = v.c.map(hex);
    const apply = () => { this.cur.mode = v.mode; this.cur.multi = v.multi ? 1 : 0; this.cur.film = v.film ? 1 : 0; };
    const monoTarget = v.mono ? 1 : 0;
    const flowTarget = v.flow ?? 0.5, glowTarget = v.glow ?? 0.5;
    if (this.from) {
      const k = Math.min(1, (now - this.from.start) / 4000), e = k * k * (3 - 2 * k);
      this.cur.c = this.from.c.map((c, j) => c.map((x, m) => x + (target[j][m] - x) * e)) as typeof this.cur.c;
      this.cur.mono = this.from.mono + (monoTarget - this.from.mono) * e;
      this.cur.flow = this.from.flow + (flowTarget - this.from.flow) * e;
      this.cur.glow = this.from.glow + (glowTarget - this.from.glow) * e;
      if (e > 0.5) apply();
      if (k >= 1) this.from = null;
    } else { this.cur.c = target; this.cur.mono = monoTarget; this.cur.flow = flowTarget; this.cur.glow = glowTarget; apply(); }
  }

  private emit(force = false) {
    if (!this.onStatus) return;
    if (!force && this.statusTick++ % 6) return;
    this.onStatus({ source: this.source, energy: this.L.fast, mood: this.L.mood, bpm: this.L.bpm, palette: this.active.id, name: this.active.name });
  }

  private frame(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.listen(now);
    if (!this.reduce) this.T += dt * (0.25 + this.cur.flow * 0.9) * (0.6 + this.L.fast * 1.4);
    this.stepPalette(now);
    if (now - this.lastFollow > 1000) { this.lastFollow = now; this.followMusic(now); }
    const { gl, U, cur, L } = this;
    gl.uniform2f(U.res, this.canvas.width, this.canvas.height);
    gl.uniform1f(U.t, this.T);
    gl.uniform1f(U.energy, L.fast);
    gl.uniform1f(U.pulse, this.reduce ? 0 : Math.min(1, L.pulse * 1.4));
    gl.uniform1f(U.mode, cur.mode);
    gl.uniform1f(U.multi, cur.multi);
    gl.uniform1f(U.film, cur.film);
    gl.uniform1f(U.mono, cur.mono);
    gl.uniform1f(U.glow, cur.glow);
    this.cur.overlay += ((this.overlayOn ? 1 : 0) - this.cur.overlay) * Math.min(1, dt * 1.5);
    gl.uniform1f(U.overlay, this.cur.overlay);
    gl.uniform1f(U.lights, this.lightsOff ? 0 : 1);
    gl.uniform3fv(U.c0, cur.c[0]);
    gl.uniform3fv(U.c1, cur.c[1]);
    gl.uniform3fv(U.c2, cur.c[2]);
    gl.uniform3fv(U.c3, cur.c[3]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!this.reduce) {
      const z = 1.02 + L.pulse * (0.035 + L.fast * 0.05);
      (this.pulseEl ?? this.canvas).style.transform = `scale(${z}) rotate(${Math.sin(this.T * 0.35) * 0.09}deg)`;
    }
    this.emit();
    this.raf = requestAnimationFrame(this.frame);
  }
}
