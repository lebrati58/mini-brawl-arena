/**
 * 100% procedural audio: every sound effect and the music are synthesised live
 * with the Web Audio API — no audio files, nothing copyrighted.
 */
type Track = 'menu' | 'battle' | 'none';

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;
  private track: Track = 'none';
  private wantedTrack: Track = 'none';
  private nextNoteTime = 0;
  private step = 0;
  private timer: number | null = null;
  private lastPlay: Record<string, number> = {};

  constructor() {
    try { this.muted = localStorage.getItem('mba_muted') === '1'; } catch { /* ignore */ }
    // stop the music when the tab / app goes to the background
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  /** Must be called from a user gesture (tap / click / key). */
  unlock() {
    if (!this.ctx) {
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.75; this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.32; this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.wantedTrack !== this.track) this.playMusic(this.wantedTrack);
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('mba_muted', this.muted ? '1' : '0'); } catch { /* ignore */ }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  // ---------- low-level helpers ----------
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, when = 0, bus?: AudioNode) {
    const c = this.ctx!; const t = c.currentTime + when;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filter: BiquadFilterType, freq: number, freqEnd?: number, when = 0, q = 1, bus?: AudioNode) {
    const c = this.ctx!; const t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus ?? this.sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  private ready(key: string, minGapMs = 30) {
    if (!this.ctx || this.muted) return false;
    const now = performance.now();
    if (now - (this.lastPlay[key] ?? 0) < minGapMs) return false;
    this.lastPlay[key] = now;
    return true;
  }

  // ---------- sound effects ----------
  sfx(name: string) {
    if (!this.ready(name)) return;
    const r = 1 + (Math.random() - 0.5) * 0.12; // slight pitch variation keeps it lively
    switch (name) {
      case 'shoot_blaze':
        this.tone('square', 880 * r, 240 * r, 0.12, 0.18);
        this.noise(0.08, 0.25, 'highpass', 3000);
        break;
      case 'slash':
        this.noise(0.16, 0.5, 'bandpass', 900, 5200, 0, 3);
        this.tone('sawtooth', 1400 * r, 300, 0.1, 0.08);
        break;
      case 'punch':
        this.tone('sine', 160 * r, 45, 0.3, 0.7);
        this.noise(0.18, 0.4, 'lowpass', 1200, 200);
        break;
      case 'hit':
        this.tone('square', 420 * r, 120, 0.08, 0.2);
        this.noise(0.06, 0.3, 'bandpass', 2400, 800, 0, 2);
        break;
      case 'hurt':
        this.tone('sawtooth', 260 * r, 90, 0.18, 0.22);
        break;
      case 'explode':
        this.tone('sine', 120 * r, 30, 0.6, 0.8);
        this.noise(0.7, 0.7, 'lowpass', 2400, 120);
        break;
      case 'super_ready':
        [660, 880, 1320].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.18, i * 0.07));
        break;
      case 'meteor_cast':
        this.tone('sawtooth', 300, 1600, 0.45, 0.15);
        this.noise(0.5, 0.3, 'bandpass', 600, 4000, 0, 2);
        break;
      case 'dash':
        this.noise(0.4, 0.6, 'bandpass', 600, 7000, 0, 4);
        this.tone('square', 220, 1760, 0.3, 0.15);
        this.tone('sawtooth', 1760, 3520, 0.25, 0.08, 0.05);
        break;
      case 'shockwave':
        this.tone('sine', 90, 25, 1.0, 1.0);
        this.tone('square', 180, 40, 0.5, 0.25);
        this.noise(1.0, 0.8, 'lowpass', 1800, 60);
        break;
      case 'crate':
        this.noise(0.3, 0.6, 'bandpass', 700, 200, 0, 1.5);
        this.tone('triangle', 200 * r, 80, 0.2, 0.3);
        break;
      case 'wall':
        this.noise(0.05, 0.15, 'highpass', 2000);
        break;
      case 'pickup':
        [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.2, i * 0.05));
        break;
      case 'ko':
        this.tone('square', 600, 80, 0.5, 0.2);
        [784, 988, 1175].forEach((f, i) => this.tone('triangle', f, f, 0.14, 0.15, 0.1 + i * 0.06));
        break;
      case 'empty':
        this.tone('square', 140, 120, 0.06, 0.12);
        break;
      case 'click':
        this.tone('triangle', 900, 1200, 0.07, 0.2);
        break;
      case 'select':
        this.tone('square', 523, 523, 0.08, 0.14);
        this.tone('square', 784, 784, 0.12, 0.14, 0.07);
        break;
      case 'beep':
        this.tone('square', 660, 660, 0.18, 0.25);
        break;
      case 'go':
        this.tone('square', 1320, 1320, 0.45, 0.25);
        this.tone('sawtooth', 660, 660, 0.45, 0.12);
        this.noise(0.4, 0.3, 'highpass', 4000);
        break;
      case 'whoosh':
        this.noise(0.35, 0.35, 'bandpass', 400, 3000, 0, 2);
        break;
      case 'victory': {
        const seq = [523, 659, 784, 1047, 784, 1047, 1319];
        seq.forEach((f, i) => { this.tone('square', f, f, 0.22, 0.16, i * 0.11); this.tone('triangle', f / 2, f / 2, 0.22, 0.2, i * 0.11); });
        this.noise(0.8, 0.25, 'highpass', 6000, 9000, 0.77);
        break;
      }
      case 'defeat': {
        const seq = [392, 370, 349, 262];
        seq.forEach((f, i) => this.tone('sawtooth', f, f * (i === 3 ? 0.7 : 1), i === 3 ? 0.7 : 0.25, 0.15, i * 0.25));
        break;
      }
    }
  }

  // ---------- music sequencer ----------
  playMusic(track: Track) {
    this.wantedTrack = track;
    if (!this.ctx) return;
    if (this.track === track) return;
    this.track = track;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.08;
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    if (track !== 'none') this.timer = window.setInterval(() => this.schedule(), 25);
  }

  private schedule() {
    const c = this.ctx; if (!c) return;
    const bpm = this.track === 'battle' ? 140 : 112;
    const stepDur = 60 / bpm / 4;
    while (this.nextNoteTime < c.currentTime + 0.12) {
      this.playStep(this.step, this.nextNoteTime - c.currentTime);
      this.nextNoteTime += stepDur;
      this.step = (this.step + 1) % 128;
    }
  }

  private playStep(s: number, when: number) {
    if (this.muted) return;
    const bus = this.musicBus;
    const bar = Math.floor(s / 16) % 8;
    const i = s % 16;
    // A minor feel progression: Am F C G | Am F G E
    const roots = [57, 53, 48, 55, 57, 53, 55, 52];
    const chordTypes = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];
    const root = roots[bar];
    const chord = chordTypes[bar];
    const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    const battle = this.track === 'battle';

    // drums
    if (battle) {
      if (i % 4 === 0) this.kick(when, bus);
      if (i === 4 || i === 12) this.noise(0.14, 0.32, 'bandpass', 1800, 900, when, 0.8, bus);
      if (i % 2 === 1) this.noise(0.03, 0.12, 'highpass', 8000, undefined, when, 1, bus);
    } else {
      if (i === 0 || i === 10) this.kick(when, bus, 0.5);
      if (i === 8) this.noise(0.1, 0.12, 'bandpass', 2000, 1000, when, 1, bus);
      if (i % 4 === 2) this.noise(0.025, 0.06, 'highpass', 9000, undefined, when, 1, bus);
    }
    // bass
    const bassPattern = battle ? [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0] : [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    if (bassPattern[i]) {
      const oct = i % 8 === 6 ? 12 : 0;
      this.pluck('sawtooth', mtof(root - 24 + oct), 0.16, battle ? 0.22 : 0.17, when, bus, 900);
    }
    // arpeggio lead
    const arp = [0, 1, 2, 1, 2, 3, 2, 1];
    if (i % 2 === 0 || battle) {
      const k = arp[(i >> (battle ? 0 : 1)) % 8];
      const note = root + (k === 3 ? 12 : chord[k]) + 12;
      this.pluck(battle ? 'square' : 'triangle', mtof(note), 0.12, battle ? 0.05 : 0.09, when, bus, 3200);
    }
    // melody hook on every other phrase
    if (bar % 2 === 1 && (i === 0 || i === 6 || i === 10 || i === 12)) {
      const mel = [12, 10, 7, 12];
      const idx = [0, 6, 10, 12].indexOf(i);
      this.pluck('square', mtof(root + 12 + mel[idx]), 0.28, 0.06, when, bus, 4000);
    }
  }

  private kick(when: number, bus: AudioNode, vol = 0.8) {
    const c = this.ctx!; const t = c.currentTime + when;
    const o = c.createOscillator(); const g = c.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(bus); o.start(t); o.stop(t + 0.25);
  }

  private pluck(type: OscillatorType, f: number, dur: number, vol: number, when: number, bus: AudioNode, cutoff: number) {
    const c = this.ctx!; const t = c.currentTime + when;
    const o = c.createOscillator(); const g = c.createGain(); const fl = c.createBiquadFilter();
    o.type = type; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(cutoff, t); fl.frequency.exponentialRampToValueAtTime(cutoff * 0.3, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl).connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.02);
  }
}

export const Audio = new AudioEngine();

export function vibrate(pattern: number | number[]) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* not supported */ }
}
