// A "chiptune" audio engine built on the Web Audio API. Most SFX are
// synthesized blips (no files, nothing to license), but where a matching
// royalty-free sample exists (see src/assets/game/sfx, sourced from Kenney
// packs — CC0, see CREDITS.md) we decode and play that instead, for a bit
// more character. Every sample has a synthesized fallback: Safari/iOS can't
// decode Ogg Vorbis via the Web Audio API, so `loadSamples()` swallows
// per-file decode failures and `playSfx` just keeps using the blip for that
// name — no game ever breaks over missing audio.
//
// A separate, smaller "announcer" layer (`playAnnouncer`) plays short
// spoken voice-over clips (Kenney Voiceover Pack #1, Male) as a bonus flavor
// on top of the existing sfx/music, not a replacement for it — GameShell
// calls both a playSfx(...) stinger and a playAnnouncer(...) line for the
// same moment (round start, game over, new high score). Unlike playSfx,
// announcer clips have no synthesized fallback: if the sample doesn't
// decode, that one line is silently skipped, since the sfx stinger already
// covers the core feedback for that moment.
//
// Sample files are imported as real Vite asset modules (not hardcoded
// "/public/..." paths) so the resolved URLs are automatically correct
// under any deploy base path, including a GitHub Pages project subpath.
//
// Must be unlocked by a user gesture (browsers block autoplay audio), so
// call `engine.unlock()` from the first click/keydown/touchstart.

import tileSwapUrl from "../assets/game/sfx/tile-swap.ogg";
import placementUrl from "../assets/game/sfx/placement.ogg";
import coinUrl from "../assets/game/sfx/coin.ogg";
import impactUrl from "../assets/game/sfx/impact.ogg";
import tileMatchUrl from "../assets/game/sfx/tile-match.ogg";
import enemyDestroyUrl from "../assets/game/sfx/enemy-destroy.ogg";
import jumpUrl from "../assets/game/sfx/jump.ogg";
import blasterUrl from "../assets/game/sfx/blaster.ogg";
import skidUrl from "../assets/game/sfx/skid.ogg";
import engineLoopUrl from "../assets/game/sfx/engine.ogg";
import backUrl from "../assets/game/sfx/back.ogg";
import highscoreUrl from "../assets/game/sfx/highscore.ogg";
import voiceReadyUrl from "../assets/game/sfx/voice-ready.ogg";
import voiceGameoverUrl from "../assets/game/sfx/voice-gameover.ogg";
import voiceHighscoreUrl from "../assets/game/sfx/voice-highscore.ogg";

export type SfxName =
  | "move"
  | "select"
  | "back"
  | "coin"
  | "hit"
  | "powerup"
  | "clear"
  | "gameover"
  | "start"
  | "jump"
  | "shoot"
  | "skid"
  | "highscore";
export type MusicMood = "menu" | "action";
export type AnnouncerName = "ready" | "gameover" | "highscore";

type SampleName = SfxName | "engineLoop";
type BlipType = OscillatorType;
interface BlipOptions {
  freq: number;
  dur?: number;
  type?: BlipType;
  startFreq?: number;
  sweepTo?: number;
  gain?: number;
  delay?: number;
}

const NOTE_NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"] as const;

// name -> sample used by playSfx(name) when decoding succeeds. Not every
// SfxName has a matching sample on purpose ("gameover" stays
// synthesized-only, since the announcer voice line layered on top already
// gives that moment extra character) — those names just fall straight
// through to the blip.
const SAMPLE_URLS: Partial<Record<SampleName, string>> = {
  move: tileSwapUrl,
  select: placementUrl,
  back: backUrl,
  coin: coinUrl,
  hit: impactUrl,
  powerup: tileMatchUrl,
  clear: enemyDestroyUrl,
  start: jumpUrl,
  jump: jumpUrl,
  shoot: blasterUrl,
  skid: skidUrl,
  highscore: highscoreUrl,
  engineLoop: engineLoopUrl,
};
const SAMPLE_GAIN: Partial<Record<SampleName, number>> = {
  move: 0.35,
  select: 0.6,
  back: 0.5,
  coin: 0.7,
  hit: 0.6,
  powerup: 0.7,
  clear: 0.6,
  start: 0.6,
  jump: 0.6,
  shoot: 0.5,
  skid: 0.5,
  highscore: 0.7,
};

// Voice-over clips (see the file-level comment above) — a separate map from
// SAMPLE_URLS/SAMPLE_GAIN because these are played by playAnnouncer(), not
// playSfx(), and never fall back to a synthesized blip.
const ANNOUNCER_URLS: Record<AnnouncerName, string> = {
  ready: voiceReadyUrl,
  gameover: voiceGameoverUrl,
  highscore: voiceHighscoreUrl,
};

function noteFreq(name: (typeof NOTE_NAMES)[number], octave: number): number {
  const idx = NOTE_NAMES.indexOf(name);
  const midi = (octave + 1) * 12 + idx;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// n(note) helper: "A3" -> frequency
function n(spec: string): number {
  const m = /^([A-G]s?)(\d)$/.exec(spec);
  if (!m) return 220;
  return noteFreq(m[1] as (typeof NOTE_NAMES)[number], Number(m[2]));
}

type Pattern = { bpm: number; bass: (string | null)[]; lead: (string | null)[] };

// Thrilling, driving A-minor pattern for gameplay; brighter C-major-ish for menu.
const PATTERNS: Record<MusicMood, Pattern> = {
  menu: {
    bpm: 128,
    bass: ["C3", null, "G2", null, "A2", null, "F2", null, "C3", null, "G2", null, "A2", null, "G2", null],
    lead: [
      "E4", "G4", "C5", "G4", "E4", "G4", "C5", "G4",
      "D4", "F4", "A4", "F4", "D4", "F4", "A4", "G4",
    ],
  },
  action: {
    bpm: 156,
    bass: ["A2", "A2", null, "A2", "E2", "E2", null, "E2", "F2", "F2", null, "F2", "G2", "G2", null, "G2"],
    lead: [
      "A4", "C5", "E5", "C5", "A4", "C5", "E5", "G5",
      "F4", "A4", "C5", "A4", "G4", "B4", "D5", "E5",
    ],
  },
};

class ChiptuneEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  // Internal mix balance (music sits quieter than sfx by design) — the
  // public volume setters below scale on top of this, so a 100% music
  // slider sounds the same as this app always has, not deafening.
  private readonly musicMix = 0.35;
  private readonly sfxMix = 0.9;
  private musicVolume = 1;
  private sfxVolume = 1;
  private musicMuted = false;
  private sfxMuted = false;
  private samples: Partial<Record<SampleName, AudioBuffer>> = {};
  private announcerSamples: Partial<Record<AnnouncerName, AudioBuffer>> = {};
  private engineSource: AudioBufferSourceNode | null = null;

  // music scheduler state
  private mood: MusicMood | null = null;
  private step = 0;
  private nextNoteTime = 0;
  private schedulerId: ReturnType<typeof setInterval> | null = null;
  private readonly lookahead = 25; // ms
  private readonly scheduleAhead = 0.12; // seconds

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicMuted ? 0 : this.musicMix * this.musicVolume;
    this.musicGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxMuted ? 0 : this.sfxMix * this.sfxVolume;
    this.sfxGain.connect(this.ctx.destination);

    void this.loadSamples();
    void this.loadAnnouncerSamples();
  }

  private async loadSamples(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(
      (Object.entries(SAMPLE_URLS) as [SampleName, string][]).map(async ([name, url]) => {
        try {
          const res = await fetch(url);
          const buf = await res.arrayBuffer();
          this.samples[name] = await ctx.decodeAudioData(buf);
        } catch {
          // unsupported codec (e.g. Safari + Ogg Vorbis) or fetch failure —
          // that name just keeps using its synthesized blip, silently.
        }
      })
    );
  }

  private async loadAnnouncerSamples(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(
      (Object.entries(ANNOUNCER_URLS) as [AnnouncerName, string][]).map(async ([name, url]) => {
        try {
          const res = await fetch(url);
          const buf = await res.arrayBuffer();
          this.announcerSamples[name] = await ctx.decodeAudioData(buf);
        } catch {
          // same as loadSamples() — if this voice line can't be decoded,
          // playAnnouncer(name) just silently does nothing for that name.
        }
      })
    );
  }

  private playSample(name: SampleName): boolean {
    const buffer = this.samples[name];
    if (!buffer || !this.ctx || !this.sfxGain) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = SAMPLE_GAIN[name] ?? 0.7;
    src.connect(g).connect(this.sfxGain);
    src.start();
    return true;
  }

  // Plays a short spoken voice-over clip as a bonus layer on top of whatever
  // playSfx()/music is already sounding — no synthesized fallback (see the
  // file-level comment). Safe to call even if the sample never decoded or
  // the engine hasn't been unlocked yet; it just silently no-ops.
  playAnnouncer(name: AnnouncerName): void {
    const buffer = this.announcerSamples[name];
    if (!buffer || !this.ctx || !this.sfxGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = 0.8;
    src.connect(g).connect(this.sfxGain);
    src.start();
  }

  private applyMusicGain(): void {
    if (this.musicGain && this.ctx) {
      const target = this.musicMuted ? 0 : this.musicMix * this.musicVolume;
      this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }
  private applySfxGain(): void {
    if (this.sfxGain && this.ctx) {
      const target = this.sfxMuted ? 0 : this.sfxMix * this.sfxVolume;
      this.sfxGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.min(1, Math.max(0, volume));
    this.applyMusicGain();
  }
  setSfxVolume(volume: number): void {
    this.sfxVolume = Math.min(1, Math.max(0, volume));
    this.applySfxGain();
  }
  setMusicMuted(muted: boolean): void {
    this.musicMuted = muted;
    this.applyMusicGain();
  }
  setSfxMuted(muted: boolean): void {
    this.sfxMuted = muted;
    this.applySfxGain();
  }

  // ---- SFX -----------------------------------------------------------
  private blip({ freq, dur = 0.12, type = "square", startFreq, sweepTo, gain = 0.5, delay = 0 }: BlipOptions): void {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq ?? freq, t0);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  playSfx(name: SfxName): void {
    if (!this.ctx) return;
    if (this.playSample(name)) return;
    switch (name) {
      case "move":
        this.blip({ freq: 440, dur: 0.05, type: "square", gain: 0.25 });
        break;
      case "select":
        this.blip({ freq: 660, dur: 0.08, type: "square", gain: 0.35 });
        this.blip({ freq: 880, dur: 0.1, type: "square", gain: 0.3, delay: 0.06 });
        break;
      case "back":
        this.blip({ freq: 440, dur: 0.09, type: "square", startFreq: 440, sweepTo: 220, gain: 0.3 });
        break;
      case "coin":
        this.blip({ freq: 988, dur: 0.06, type: "square", gain: 0.4 });
        this.blip({ freq: 1568, dur: 0.12, type: "square", gain: 0.35, delay: 0.05 });
        break;
      case "hit":
        this.blip({ freq: 180, dur: 0.15, type: "sawtooth", startFreq: 180, sweepTo: 60, gain: 0.4 });
        break;
      case "powerup":
        this.blip({ freq: 523, dur: 0.3, type: "triangle", startFreq: 261, sweepTo: 1046, gain: 0.4 });
        break;
      case "clear":
        [523, 659, 784, 1046].forEach((f, i) => this.blip({ freq: f, dur: 0.14, type: "square", gain: 0.35, delay: i * 0.07 }));
        break;
      case "gameover":
        [392, 349, 311, 261].forEach((f, i) => this.blip({ freq: f, dur: 0.28, type: "sawtooth", gain: 0.35, delay: i * 0.15 }));
        break;
      case "highscore":
        [523, 659, 784, 1046, 1319].forEach((f, i) => this.blip({ freq: f, dur: 0.16, type: "triangle", gain: 0.4, delay: i * 0.09 }));
        break;
      case "start":
        [261, 329, 392, 523].forEach((f, i) => this.blip({ freq: f, dur: 0.12, type: "triangle", gain: 0.3, delay: i * 0.08 }));
        break;
      case "jump":
        this.blip({ freq: 300, dur: 0.12, type: "square", startFreq: 300, sweepTo: 620, gain: 0.3 });
        break;
      case "shoot":
        this.blip({ freq: 900, dur: 0.07, type: "sawtooth", startFreq: 900, sweepTo: 300, gain: 0.3 });
        break;
      case "skid":
        this.blip({ freq: 220, dur: 0.1, type: "sawtooth", startFreq: 220, sweepTo: 90, gain: 0.2 });
        break;
      default:
        break;
    }
  }

  // ---- Looping engine hum (Turbo Dash only) -----------------------------
  playEngineLoop(): void {
    if (!this.ctx || this.engineSource || !this.sfxGain) return;
    const buffer = this.samples.engineLoop;
    if (!buffer) return; // no decoded sample yet/ever — the racing action music covers it
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0.22;
    src.connect(g).connect(this.sfxGain);
    src.start();
    this.engineSource = src;
  }

  setEngineRate(rate: number): void {
    if (this.engineSource && this.ctx) this.engineSource.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.15);
  }

  stopEngineLoop(): void {
    if (this.engineSource) {
      try {
        this.engineSource.stop();
      } catch {
        // already stopped
      }
      this.engineSource = null;
    }
  }

  // ---- Music -----------------------------------------------------------
  startMusic(mood: MusicMood = "menu"): void {
    if (!this.ctx) return;
    if (this.mood === mood && this.schedulerId) return;
    this.stopMusic();
    this.mood = mood;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.schedulerId = setInterval(() => this.scheduler(), this.lookahead);
  }

  stopMusic(): void {
    if (this.schedulerId) clearInterval(this.schedulerId);
    this.schedulerId = null;
    this.mood = null;
  }

  private scheduler(): void {
    if (!this.ctx || !this.mood) return;
    const pattern = PATTERNS[this.mood];
    if (!pattern) return;
    const stepDur = 60 / pattern.bpm / 2; // 8th notes
    // Background tabs throttle setInterval heavily (often to ~1/sec), so
    // `nextNoteTime` can fall far behind `currentTime` while backgrounded.
    // Without this, the catch-up loop below would fire every missed step in
    // one burst the moment the tab regains focus — an audible glitch of
    // overlapping notes. If we've drifted more than a beat behind, just jump
    // back onto the schedule instead of catching up note-by-note.
    const maxDrift = stepDur * 4;
    if (this.nextNoteTime < this.ctx.currentTime - maxDrift) {
      const missedSteps = Math.floor((this.ctx.currentTime - this.nextNoteTime) / stepDur);
      this.nextNoteTime += missedSteps * stepDur;
      this.step += missedSteps;
    }
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAhead) {
      const i = this.step % pattern.bass.length;
      const bassNote = pattern.bass[i];
      const leadNote = pattern.lead[i];
      if (bassNote) this.musicNote(n(bassNote), this.nextNoteTime, stepDur * 0.9, "triangle", 0.5);
      if (leadNote) this.musicNote(n(leadNote), this.nextNoteTime, stepDur * 0.5, "square", 0.18);
      this.nextNoteTime += stepDur;
      this.step += 1;
    }
  }

  private musicNote(freq: number, time: number, dur: number, type: BlipType, gain: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g).connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }
}

export const engine = new ChiptuneEngine();
