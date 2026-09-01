// Ambient drifting "pixel stars" behind every screen — cheap, GPU-friendly,
// and respects prefers-reduced-motion via the global CSS override.
export default function Starfield() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div
        className="absolute inset-x-0 -top-full h-[200%] opacity-40 animate-[drift-star_60s_linear_infinite]"
        style={{
          backgroundImage:
            "radial-gradient(2px 2px at 20% 10%, #fff, transparent), radial-gradient(2px 2px at 60% 40%, #ffd43b, transparent), radial-gradient(1.5px 1.5px at 80% 20%, #2ee6d6, transparent), radial-gradient(2px 2px at 33% 70%, #fff, transparent), radial-gradient(1.5px 1.5px at 90% 80%, #ff4d8d, transparent), radial-gradient(2px 2px at 10% 90%, #fff, transparent)",
          backgroundSize: "100% 50%",
          backgroundRepeat: "repeat",
        }}
      />
    </div>
  );
}
