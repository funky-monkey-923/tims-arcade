// Ambient drifting "pixel stars" behind every screen — cheap, GPU-friendly,
// and respects prefers-reduced-motion via the global CSS override. Three
// depth layers (different sizes/speeds/opacity) instead of one flat drift,
// for a subtle parallax feel without any extra JS — each is just the same
// CSS animation at a different duration/scale.
const LAYERS = [
  { duration: "90s", opacity: 0.25, size: "80% 40%", dotScale: 0.8 },
  { duration: "60s", opacity: 0.4, size: "100% 50%", dotScale: 1 },
  { duration: "38s", opacity: 0.5, size: "130% 65%", dotScale: 1.3 },
];

function layerGradient(scale: number): string {
  const s = (n: number) => `${(n * scale).toFixed(1)}px`;
  return [
    `radial-gradient(${s(2)} ${s(2)} at 20% 10%, #fff, transparent)`,
    `radial-gradient(${s(2)} ${s(2)} at 60% 40%, #ffd43b, transparent)`,
    `radial-gradient(${s(1.5)} ${s(1.5)} at 80% 20%, #2ee6d6, transparent)`,
    `radial-gradient(${s(2)} ${s(2)} at 33% 70%, #fff, transparent)`,
    `radial-gradient(${s(1.5)} ${s(1.5)} at 90% 80%, #ff4d8d, transparent)`,
    `radial-gradient(${s(2)} ${s(2)} at 10% 90%, #fff, transparent)`,
  ].join(", ");
}

export default function Starfield() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {LAYERS.map((layer, i) => (
        <div
          key={i}
          className="absolute inset-x-0 -top-full h-[200%]"
          style={{
            opacity: layer.opacity,
            backgroundImage: layerGradient(layer.dotScale),
            backgroundSize: layer.size,
            backgroundRepeat: "repeat",
            animation: `drift-star ${layer.duration} linear infinite`,
          }}
        />
      ))}
    </div>
  );
}
