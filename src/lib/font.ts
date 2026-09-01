// Registers the self-hosted display font via the CSS Font Loading API
// instead of a static @font-face url() in CSS. This matters because the
// font file is imported as a real Vite asset (so its resolved URL is
// correct under any deploy base path, e.g. a GitHub Pages project
// subpath) — a hardcoded "/assets/..." path in plain CSS wouldn't get
// that same base-path rewriting.
//
// Font: Lilita One, SIL Open Font License 1.1 — see
// src/assets/game/fonts/LilitaOne-LICENSE.txt and CREDITS.md.

import lilitaOneUrl from "../assets/game/fonts/LilitaOne-Regular.ttf";

export function loadDisplayFont(): void {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const face = new FontFace("Lilita One", `url(${lilitaOneUrl})`, { weight: "400", style: "normal" });
  face
    .load()
    .then((loaded) => {
      document.fonts.add(loaded);
    })
    .catch(() => {
      // font failed to load/parse — --font-display's fallback stack
      // (Nunito, system-ui, sans-serif) takes over, nothing breaks.
    });
}
