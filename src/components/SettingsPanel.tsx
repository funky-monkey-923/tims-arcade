import { useArcade } from "../context/ArcadeContext";
import { engine } from "../lib/audio";

interface SettingsPanelProps {
  onClose: () => void;
}

interface VolumeRowProps {
  label: string;
  icon: string;
  volume: number;
  muted: boolean;
  onVolumeChange: (v: number) => void;
  onMuteToggle: () => void;
}

function VolumeRow({ label, icon, volume, muted, onVolumeChange, onMuteToggle }: VolumeRowProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      <button
        type="button"
        onClick={onMuteToggle}
        aria-label={muted ? `Unmute ${label}` : `Mute ${label}`}
        aria-pressed={muted}
        className="w-11 h-11 shrink-0 rounded-full bg-night/60 border-2 border-violet-2 flex items-center justify-center text-lg hover:bg-violet-2/60 transition-colors"
      >
        {muted ? "🔇" : icon}
      </button>
      <div className="flex-1">
        <label className="flex items-center justify-between font-display font-bold text-sm text-cloud/80 mb-1">
          <span>{label}</span>
          <span className="font-pixel text-[9px] text-cloud/50">{muted ? "MUTED" : `${Math.round(volume * 100)}%`}</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(volume * 100)}
          onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
          disabled={muted}
          aria-label={`${label} volume`}
          className="w-full h-3 accent-teal disabled:opacity-40"
        />
      </div>
    </div>
  );
}

// A settings modal reachable from any screen via TopBar's ⚙️ button. Keeps
// audio mix controls (and, going forward, other app-wide accessibility
// settings like reduced motion) in one predictable place rather than
// scattered across screens.
export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, updateSettings } = useArcade();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-night/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-cabinet border-4 border-violet-2 bg-violet p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-extrabold text-2xl text-sun">⚙️ Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="w-9 h-9 rounded-full bg-night/60 border-2 border-violet-2 hover:bg-violet-2/60 transition-colors"
          >
            ✕
          </button>
        </div>

        <p className="font-display font-bold text-xs text-cloud/60 uppercase tracking-wide mb-1">Sound</p>
        <VolumeRow
          label="Music"
          icon="🎵"
          volume={settings.musicVolume}
          muted={settings.musicMuted}
          onVolumeChange={(v) => updateSettings({ musicVolume: v })}
          onMuteToggle={() => updateSettings({ musicMuted: !settings.musicMuted })}
        />
        <VolumeRow
          label="Sound Effects"
          icon="🔊"
          volume={settings.sfxVolume}
          muted={settings.sfxMuted}
          onVolumeChange={(v) => {
            updateSettings({ sfxVolume: v });
          }}
          onMuteToggle={() => updateSettings({ sfxMuted: !settings.sfxMuted })}
        />

        <button
          type="button"
          onClick={() => {
            engine.unlock();
            engine.playSfx("select");
          }}
          className="mt-2 w-full rounded-full bg-night/50 border-2 border-violet-2 py-2 font-display font-bold text-sm text-cloud/70 hover:bg-violet-2/40 transition-colors"
        >
          🔈 Test sound
        </button>

        <p className="font-display font-bold text-xs text-cloud/60 uppercase tracking-wide mt-5 mb-1">Comfort</p>
        <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
          <span>
            <span className="font-display font-bold text-sm text-cloud/80 block">Reduce motion</span>
            <span className="text-xs text-cloud/50">Calms background drift, pulses, and hover animations</span>
          </span>
          <input
            type="checkbox"
            checked={settings.reducedMotion}
            onChange={(e) => updateSettings({ reducedMotion: e.target.checked })}
            aria-label="Reduce motion"
            className="w-6 h-6 accent-teal shrink-0"
          />
        </label>
      </div>
    </div>
  );
}
