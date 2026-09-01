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

// Added 2026-08-31 for the Kickoff Clash / Turbo Dash artistic overhaul.
// Both games previously reused generic UI blips for their signature moments
// (a ball strike played the menu tile-swap sound), which read as placeholder.
import kickUrl from "../assets/game/sfx/kick.ogg";
import netUrl from "../assets/game/sfx/net.ogg";
import crashUrl from "../assets/game/sfx/crash.ogg";
import boostUrl from "../assets/game/sfx/boost.ogg";
import countdownUrl from "../assets/game/sfx/countdown.ogg";
import goalHornUrl from "../assets/game/sfx/goal-horn.ogg";
import fanfareUrl from "../assets/game/sfx/fanfare.ogg";
import voice3Url from "../assets/game/sfx/voice-3.ogg";
import voice2Url from "../assets/game/sfx/voice-2.ogg";
import voice1Url from "../assets/game/sfx/voice-1.ogg";
import voiceGoUrl from "../assets/game/sfx/voice-go.ogg";
import voiceSetUrl from "../assets/game/sfx/voice-set.ogg";
import voiceFinalRoundUrl from "../assets/game/sfx/voice-final-round.ogg";
import voiceHurryUpUrl from "../assets/game/sfx/voice-hurry-up.ogg";
import voiceYouWinUrl from "../assets/game/sfx/voice-you-win.ogg";
import voiceTieUrl from "../assets/game/sfx/voice-tie.ogg";
import voiceTimeOverUrl from "../assets/game/sfx/voice-time-over.ogg";

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
  | "highscore"
  // Kickoff Clash
  | "kick"
  | "net"
  | "whistle"
  | "goalHorn"
  // Turbo Dash
  | "crash"
  | "boost"
  // shared
  | "countdown"
  | "fanfare";
export type MusicMood = "menu" | "action" | "sports" | "race" | "space" | "fight";
export type AnnouncerName =
  | "ready"
  | "gameover"
  | "highscore"
  | "three"
  | "two"
  | "one"
  | "go"
  | "set"
  | "finalRound"
  | "hurryUp"
  | "youWin"
  | "tie"
  | "timeOver";

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
  kick: kickUrl,
  net: netUrl,
  crash: crashUrl,
  boost: boostUrl,
  countdown: countdownUrl,
  goalHorn: goalHornUrl,
  fanfare: fanfareUrl,
  engineLoop: engineLoopUrl,
  // Deliberately absent: "whistle". No Kenney pack ships a referee whistle,
  // and it's the one sound in Kickoff Clash a kid will recognise instantly,
  // so it's fully synthesized below (see `whistleSynth`) rather than
  // approximated with a wrong-sounding sample.
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
  // The impact samples are normalized hot (peak ~1.27), so they sit lower
  // than the UI blips to keep a rally of kicks from clipping the sfx bus.
  kick: 0.45,
  net: 0.4,
  crash: 0.55,
  boost: 0.5,
  countdown: 0.6,
  goalHorn: 0.7,
  fanfare: 0.7,
};

// Voice-over clips (see the file-level comment above) — a separate map from
// SAMPLE_URLS/SAMPLE_GAIN because these are played by playAnnouncer(), not
// playSfx(), and never fall back to a synthesized blip.
const ANNOUNCER_URLS: Record<AnnouncerName, string> = {
  ready: voiceReadyUrl,
  gameover: voiceGameoverUrl,
  highscore: voiceHighscoreUrl,
  three: voice3Url,
  two: voice2Url,
  one: voice1Url,
  go: voiceGoUrl,
  set: voiceSetUrl,
  finalRound: voiceFinalRoundUrl,
  hurryUp: voiceHurryUpUrl,
  youWin: voiceYouWinUrl,
  tie: voiceTieUrl,
  timeOver: voiceTimeOverUrl,
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

// Idle murmur vs. full-throated roar for the synthesized crowd layer below.
// Both are deliberately modest: the crowd rides under the music on the same
// bus, so a "peak" that felt right soloed would bury the melody in practice.
const CROWD_BASE = 0.05;
const CROWD_PEAK = 0.28;

// Thrilling, driving A-minor pattern for gameplay; brighter C-major-ish for menu.
// "sports" and "race" were added so Kickoff Clash and Turbo Dash stop sharing
// the generic "action" loop with the shooter — each now has its own identity.
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
  // Stadium terrace chant: a slow, wide, major-key anthem built on long
  // held bass roots and a lead that repeats each note in pairs, which is
  // what makes a crowd chant read as a chant rather than a melody.
  // Deliberately the slowest of the four so it sits under the crowd
  // ambience layer instead of fighting it.
  sports: {
    bpm: 108,
    bass: ["G2", null, null, null, "D3", null, null, null, "E3", null, null, null, "C3", null, null, null],
    lead: [
      "G4", "G4", "B4", "B4", "D5", "D5", "B4", "B4",
      "E5", "E5", "D5", "D5", "B4", "B4", "G4", null,
    ],
  },
  // Motorsport chase: fastest of the four, with a relentless straight-eighths
  // bass (no rests — it should feel like it never lets you breathe) and a
  // chromatic D-minor lead that climbs, drops, and climbs again.
  race: {
    bpm: 172,
    bass: ["D2", "D2", "D2", "D2", "D2", "D2", "F2", "G2", "A2", "A2", "A2", "A2", "G2", "G2", "F2", "E2"],
    lead: [
      "D5", "F5", "A5", "F5", "D5", "F5", "A5", "C6",
      "As5", "A5", "G5", "F5", "E5", "G5", "F5", "D5",
    ],
  },
  // Star Defender: deliberately sparser and more echoey than the other three
  // moods — a space shooter's identity is tension and isolation, not the
  // driving energy of a sport/race track. Long rests in both bass and lead
  // (as opposed to action's dense straight-eighths) leave room for the
  // blaster/impact sfx to read clearly against the music instead of
  // competing with it.
  space: {
    bpm: 132,
    bass: ["D2", null, null, null, "A2", null, null, null, "F2", null, null, null, "G2", null, null, null],
    lead: [
      null, "D5", null, "A4", null, "F5", null, "D5",
      null, "C5", null, "G4", null, "E5", null, null,
    ],
  },
  // Rumble Ring: tense, percussive E-minor stabs instead of a flowing
  // melody — a straight-eighths root pulse (with rests, so it lands like a
  // heartbeat rather than a wall of sound) under a lead that jabs and
  // retreats, echoing the punch/block rhythm of a fight rather than
  // narrating over it.
  fight: {
    bpm: 140,
    bass: ["E2", "E2", null, "E2", "E2", "E2", null, "E2", "G2", "G2", null, "G2", "F2", "F2", null, "F2"],
    lead: [
      "E5", null, "G5", null, "E5", null, "B4", null,
      "E5", null, "G5", null, "Fs5", null, "E5", null,
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
  private crowdSource: AudioBufferSourceNode | null = null;
  private crowdGain: GainNode | null = null;

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
      case "whistle":
        // Always synthesized — see the note in SAMPLE_URLS.
        this.whistleSynth();
        break;
      case "kick":
        // A boot through a ball is a low, fast-decaying thump with a click on
        // the front — the two layers are the click and the body.
        this.blip({ freq: 900, dur: 0.03, type: "square", gain: 0.2 });
        this.blip({ freq: 150, dur: 0.18, type: "sine", startFreq: 190, sweepTo: 55, gain: 0.5 });
        break;
      case "net":
        this.blip({ freq: 320, dur: 0.07, type: "triangle", startFreq: 380, sweepTo: 240, gain: 0.18 });
        break;
      case "goalHorn":
        // Rising major triad held long enough to feel like an air horn.
        [392, 494, 587].forEach((f, i) => this.blip({ freq: f, dur: 0.45, type: "sawtooth", gain: 0.3, delay: i * 0.06 }));
        break;
      case "crash":
        this.blip({ freq: 260, dur: 0.3, type: "sawtooth", startFreq: 420, sweepTo: 60, gain: 0.45 });
        this.blip({ freq: 1400, dur: 0.12, type: "square", startFreq: 1800, sweepTo: 500, gain: 0.2 });
        break;
      case "boost":
        this.blip({ freq: 700, dur: 0.4, type: "sawtooth", startFreq: 180, sweepTo: 1500, gain: 0.35 });
        break;
      case "countdown":
        this.blip({ freq: 440, dur: 0.14, type: "sine", gain: 0.4 });
        break;
      case "fanfare":
        [523, 659, 784, 1046].forEach((f, i) => this.blip({ freq: f, dur: 0.22, type: "square", gain: 0.35, delay: i * 0.1 }));
        break;
      default:
        break;
    }
  }

  // A referee's whistle: a pea whistle is two closely-detuned high tones
  // (which beat against each other to give that piercing "shriek") plus a
  // fast warble from the pea rattling around. Modelled here as two square
  // oscillators ~80 Hz apart with a shared vibrato LFO.
  private whistleSynth(dur = 0.35): void {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
    g.gain.setValueAtTime(0.22, t0 + dur - 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(this.sfxGain);

    // The warble. ~28 Hz is fast enough to sound like a rattling pea rather
    // than a wobbly siren.
    const lfo = this.ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 28;
    const lfoDepth = this.ctx.createGain();
    lfoDepth.gain.value = 55;
    lfo.connect(lfoDepth);

    const oscs: OscillatorNode[] = [];
    for (const freq of [3180, 3260]) {
      const osc = this.ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, t0);
      lfoDepth.connect(osc.frequency);
      osc.connect(g);
      oscs.push(osc);
    }

    lfo.start(t0);
    oscs.forEach((o) => o.start(t0));
    lfo.stop(t0 + dur + 0.02);
    oscs.forEach((o) => o.stop(t0 + dur + 0.02));
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

  // ---- Crowd ambience (Kickoff Clash) -----------------------------------
  // A synthesized stadium crowd: looped noise split through two bandpass
  // filters (a low "rumble" band and a higher "hiss/voices" band) so it reads
  // as a packed stand rather than as tape hiss. There's no crowd sample in
  // any of the Kenney packs, and a real crowd loop would dwarf every other
  // asset in the bundle, so this is both the better-sounding and the smaller
  // option.
  //
  // It hangs off musicGain, not sfxGain, on purpose: this is atmosphere, not
  // feedback. Muting music should silence the stadium; muting sfx should
  // still let you hear the crowd behind the whistle.
  startCrowd(): void {
    if (!this.ctx || !this.musicGain || this.crowdSource) return;
    const ctx = this.ctx;
    // 4 seconds of noise is long enough that the loop point isn't audible.
    const len = Math.floor(ctx.sampleRate * 4);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Cheap pink-ish noise: a one-pole lowpass over white noise. Pure white
    // noise sounds like static; rolling off the top end is what makes it
    // sit back and read as "distant crowd".
    let last = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.96 + white * 0.04;
      data[i] = last * 6;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const low = ctx.createBiquadFilter();
    low.type = "bandpass";
    low.frequency.value = 320;
    low.Q.value = 0.7;

    const high = ctx.createBiquadFilter();
    high.type = "bandpass";
    high.frequency.value = 1500;
    high.Q.value = 0.5;

    const highTrim = ctx.createGain();
    highTrim.gain.value = 0.5;

    const crowd = ctx.createGain();
    crowd.gain.value = CROWD_BASE;

    src.connect(low).connect(crowd);
    src.connect(high).connect(highTrim).connect(crowd);
    crowd.connect(this.musicGain);
    src.start();

    this.crowdSource = src;
    this.crowdGain = crowd;
  }

  // Swells the crowd toward `level` (0..1) and then settles back to the
  // idle murmur. Call on a goal, a near miss, or a penalty run-up.
  // `holdMs` is how long to stay up before decaying.
  cheer(level = 1, holdMs = 1200): void {
    if (!this.ctx || !this.crowdGain) return;
    const now = this.ctx.currentTime;
    const peak = CROWD_BASE + (CROWD_PEAK - CROWD_BASE) * Math.min(1, Math.max(0, level));
    const g = this.crowdGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(peak, now + 0.12);
    g.setTargetAtTime(CROWD_BASE, now + holdMs / 1000, 0.9);
  }

  // Sets the sustained crowd level directly (0..1) without a swell/decay —
  // for tension that builds and holds, e.g. a penalty shootout run-up.
  setCrowdLevel(level: number): void {
    if (!this.ctx || !this.crowdGain) return;
    const target = CROWD_BASE + (CROWD_PEAK - CROWD_BASE) * Math.min(1, Math.max(0, level));
    this.crowdGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
  }

  stopCrowd(): void {
    if (this.crowdSource) {
      try {
        this.crowdSource.stop();
      } catch {
        // already stopped
      }
      this.crowdSource = null;
    }
    this.crowdGain = null;
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
