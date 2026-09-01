import { defineConfig } from "vitest/config";

// A minimal, framework-free test config: engine/storage logic is deliberately
// plain TS with no DOM dependency (see engineTypes.ts's file header on the
// engine/render/UI split), so the default "node" test environment is enough
// — no jsdom/happy-dom needed for what's tested today. If component tests
// are ever added, this is the file to extend with `environment: "jsdom"`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
