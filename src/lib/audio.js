// A tiny synthesized "chiptune" audio engine built entirely on the Web Audio
// API — no audio files, so there's nothing to license. It provides:
//   - short SFX blips (move, select, coin, hit, clear, gameover, powerup)
//   - a looping background score with a "menu" (upbeat) and "action"
//     (thrilling, driving) mood, built from a step sequencer.
//
// Must be unlocked by a user gesture (browsers block autoplay audio), so
// call `engine.unlock()` from the first click/keydown/touchstart.

const NOTE_NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];

function noteFreq(name, octave) {
  const idx = NOTE_NAMES.indexOf(name);
  const midi = (octave + 1) * 12 + idx;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// n(note) helper: "A3" -> frequency
function n(spec) {
  const m = /^([A-G]s?)(\d)$/.exec(spec);
  if (!m) return 220;
  return noteFreq(m[1], Number(m[2]));
}

// Thrilling, driving A-minor pattern for gameplay; brighter C-major-ish for menu.
const PATTERNS = {
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
  ctx = null;
  masterGain = null;
  musicGain = null;
  sfxGain = null;
  muted = false;
  volume = 0.7;

  // music scheduler state
  mood = null;
  step = 0;
  nextNoteTime = 0;
  schedulerId = null;
  lookahead = 25; // ms
  scheduleAhead = 0.12; // seconds

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.volume;
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.35;
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.masterGain);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  // ---- SFX -----------------------------------------------------------
  _blip({ freq, dur = 0.12, type = "square", startFreq, sweepTo, gain = 0.5, delay = 0 }) {
    if (!this.ctx) return;
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

  playSfx(name) {
    if (!this.ctx) return;
    switch (name) {
      case "move":
        this._blip({ freq: 440, dur: 0.05, type: "square", gain: 0.25 });
        break;
      case "select":
        this._blip({ freq: 660, dur: 0.08, type: "square", gain: 0.35 });
        this._blip({ freq: 880, dur: 0.1, type: "square", gain: 0.3, delay: 0.06 });
        break;
      case "back":
        this._blip({ freq: 440, dur: 0.09, type: "square", startFreq: 440, sweepTo: 220, gain: 0.3 });
        break;
      case "coin":
        this._blip({ freq: 988, dur: 0.06, type: "square", gain: 0.4 });
        this._blip({ freq: 1568, dur: 0.12, type: "square", gain: 0.35, delay: 0.05 });
        break;
      case "hit":
        this._blip({ freq: 180, dur: 0.15, type: "sawtooth", startFreq: 180, sweepTo: 60, gain: 0.4 });
        break;
      case "powerup":
        this._blip({ freq: 523, dur: 0.3, type: "triangle", startFreq: 261, sweepTo: 1046, gain: 0.4 });
        break;
      case "clear":
        [523, 659, 784, 1046].forEach((f, i) => this._blip({ freq: f, dur: 0.14, type: "square", gain: 0.35, delay: i * 0.07 }));
        break;
      case "gameover":
        [392, 349, 311, 261].forEach((f, i) => this._blip({ freq: f, dur: 0.28, type: "sawtooth", gain: 0.35, delay: i * 0.15 }));
        break;
      case "start":
        [261, 329, 392, 523].forEach((f, i) => this._blip({ freq: f, dur: 0.12, type: "triangle", gain: 0.3, delay: i * 0.08 }));
        break;
      default:
        break;
    }
  }

  // ---- Music -----------------------------------------------------------
  startMusic(mood = "menu") {
    if (!this.ctx) return;
    if (this.mood === mood && this.schedulerId) return;
    this.stopMusic();
    this.mood = mood;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.schedulerId = setInterval(() => this._scheduler(), this.lookahead);
  }

  stopMusic() {
    if (this.schedulerId) clearInterval(this.schedulerId);
    this.schedulerId = null;
    this.mood = null;
  }

  _scheduler() {
    if (!this.ctx) return;
    const pattern = PATTERNS[this.mood];
    if (!pattern) return;
    const stepDur = 60 / pattern.bpm / 2; // 8th notes
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAhead) {
      const i = this.step % pattern.bass.length;
      const bassNote = pattern.bass[i];
      const leadNote = pattern.lead[i];
      if (bassNote) this._musicNote(n(bassNote), this.nextNoteTime, stepDur * 0.9, "triangle", 0.5);
      if (leadNote) this._musicNote(n(leadNote), this.nextNoteTime, stepDur * 0.5, "square", 0.18);
      this.nextNoteTime += stepDur;
      this.step += 1;
    }
  }

  _musicNote(freq, time, dur, type, gain) {
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
