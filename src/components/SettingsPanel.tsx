import { useRef, useState } from "react";
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
// A dated, human-recognizable filename (not a UUID/hash) so a downloads
// folder full of these still reads as "which backup is which" at a glance.
function backupFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `tims-arcade-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, updateSettings, exportData, importData } = useArcade();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importMessage, setImportMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const handleExport = () => {
    // A plain in-memory Blob URL, not a network round-trip — this app has no
    // backend, so "download my data" is just "hand back the JSON I already
    // have," same spirit as saveState() itself.
    const blob = new Blob([exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFilename();
    a.click();
    URL.revokeObjectURL(url);
    engine.playSfx("select");
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const result = importData(text);
      if (result.ok) {
        setImportMessage({ kind: "ok", text: "Restored! Your profiles and scores are back." });
        engine.playSfx("clear");
      } else {
        setImportMessage({ kind: "error", text: result.reason });
        engine.playSfx("back");
      }
    };
    reader.onerror = () => setImportMessage({ kind: "error", text: "Couldn't read that file." });
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-night/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-cabinet border-4 border-violet-2 bg-violet p-6">
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

        <p className="font-display font-bold text-xs text-cloud/60 uppercase tracking-wide mt-5 mb-1">Data</p>
        <p className="text-xs text-cloud/50 mb-2">
          Everything lives only on this device. Download a backup before clearing browser data, switching
          computers, or just for safekeeping.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="flex-1 rounded-full bg-night/50 border-2 border-violet-2 py-2 font-display font-bold text-sm text-cloud/80 hover:bg-violet-2/40 transition-colors"
          >
            ⬇️ Download backup
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 rounded-full bg-night/50 border-2 border-violet-2 py-2 font-display font-bold text-sm text-cloud/80 hover:bg-violet-2/40 transition-colors"
          >
            ⬆️ Restore backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Choose a backup file to restore"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Restoring replaces every profile/score/setting on this
              // device — a plain confirm() is enough friction for a
              // destructive, rare, easily-undone-by-re-exporting action
              // without building a whole custom modal for it.
              if (file && window.confirm("Restore this backup? It will replace everything currently saved on this device.")) {
                handleImportFile(file);
              }
              e.target.value = ""; // allow re-selecting the same file later
            }}
          />
        </div>
        {importMessage && (
          <p
            className={`text-xs mt-2 font-display font-bold ${importMessage.kind === "ok" ? "text-lime" : "text-coral"}`}
            role="status"
          >
            {importMessage.kind === "ok" ? "✅" : "⚠️"} {importMessage.text}
          </p>
        )}
      </div>
    </div>
  );
}
