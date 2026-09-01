import { useState } from "react";
import { useArcade } from "../context/ArcadeContext";
import { AVATARS, type Profile } from "../lib/storage";
import { useGridNav } from "../hooks/useGridNav";
import TopBar from "./TopBar";
import { engine } from "../lib/audio";

interface NewProfileFormProps {
  onCreate: (name: string, avatar: string) => void;
  onCancel: () => void;
}

function NewProfileForm({ onCreate, onCancel }: NewProfileFormProps) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string>(AVATARS[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-night/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-cabinet border-4 border-violet-2 bg-violet p-6">
        <h2 className="font-display font-extrabold text-2xl text-sun mb-4 text-center">New Player!</h2>
        <label className="block font-display font-bold text-sm mb-1 text-cloud/80" htmlFor="pname">
          Your name
        </label>
        <input
          id="pname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Type your name"
          maxLength={16}
          autoFocus
          className="w-full rounded-xl bg-night/60 border-2 border-violet-2 px-4 py-2 mb-4 font-body text-lg text-cloud outline-none focus:border-teal"
        />
        <p className="font-display font-bold text-sm mb-2 text-cloud/80">Pick a buddy</p>
        <div className="grid grid-cols-6 gap-2 mb-5">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAvatar(a)}
              className={`text-2xl rounded-xl py-2 border-2 transition-colors ${
                avatar === a ? "border-sun bg-sun/20" : "border-violet-2 hover:border-teal"
              }`}
              aria-pressed={avatar === a}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border-2 border-violet-2 py-2 font-display font-bold hover:bg-violet-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onCreate(name || "Player", avatar)}
            className="flex-1 rounded-full bg-coral py-2 font-display font-bold text-ink hover:bg-coral-2"
          >
            Let's go!
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProfilePickerProps {
  onDone: () => void;
}

export default function ProfilePicker({ onDone }: ProfilePickerProps) {
  const { profiles, activeProfileId, maxProfiles, createProfile, deleteProfile, selectProfile } = useArcade();
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const slots: (Profile | null)[] = Array.from({ length: maxProfiles }, (_, i) => profiles[i] || null);
  const columns = () => (window.innerWidth >= 900 ? 3 : window.innerWidth >= 600 ? 2 : 1);

  const [focused] = useGridNav({
    count: slots.length,
    columns,
    onConfirm: (i) => {
      const p = slots[i];
      engine.unlock();
      if (p) {
        selectProfile(p.id);
        engine.playSfx("select");
        onDone?.();
      } else {
        setShowForm(true);
      }
    },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar showProfile={false} />
      <main className="flex-1 flex flex-col items-center px-4 pb-24">
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-center mt-2 mb-1 text-cloud">
          Who's <span className="text-coral">Playing</span>?
        </h1>
        <p className="text-cloud/60 mb-8 text-center">Pick your player, or add a new one ({profiles.length}/{maxProfiles})</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-3xl">
          {slots.map((p, i) => (
            <button
              key={p ? p.id : `empty-${i}`}
              type="button"
              onClick={() => {
                engine.unlock();
                if (p) {
                  selectProfile(p.id);
                  engine.playSfx("select");
                  onDone?.();
                } else {
                  setShowForm(true);
                }
              }}
              className={`relative rounded-cabinet border-4 p-5 flex items-center gap-4 transition-all bg-violet/80 ${
                focused === i ? "border-sun shadow-glow-sun -translate-y-1" : "border-violet-2"
              } ${p?.id === activeProfileId ? "ring-2 ring-lime" : ""}`}
            >
              {p ? (
                <>
                  <span className="text-4xl" aria-hidden>
                    {p.avatar}
                  </span>
                  <span className="font-display font-bold text-lg">{p.name}</span>
                  {p.id === activeProfileId && (
                    <span className="ml-auto font-pixel text-[8px] text-lime">ACTIVE</span>
                  )}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(p.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        setConfirmDelete(p.id);
                      }
                    }}
                    aria-label={`Remove ${p.name}`}
                    className="ml-2 text-cloud/40 hover:text-coral text-sm px-2 py-1"
                  >
                    ✕
                  </span>
                </>
              ) : (
                <>
                  <span className="text-4xl text-cloud/30" aria-hidden>
                    ➕
                  </span>
                  <span className="font-display font-bold text-lg text-cloud/50">Add Player</span>
                </>
              )}
            </button>
          ))}
        </div>
      </main>

      {showForm && (
        <NewProfileForm
          onCancel={() => setShowForm(false)}
          onCreate={(name, avatar) => {
            createProfile(name, avatar);
            engine.playSfx("powerup");
            setShowForm(false);
          }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-night/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-cabinet border-4 border-coral bg-violet p-6 text-center">
            <p className="font-display font-bold text-lg mb-5">Remove this player and their scores?</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-full border-2 border-violet-2 py-2 font-display font-bold hover:bg-violet-2"
              >
                Keep them!
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteProfile(confirmDelete);
                  setConfirmDelete(null);
                }}
                className="flex-1 rounded-full bg-coral py-2 font-display font-bold text-ink hover:bg-coral-2"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
