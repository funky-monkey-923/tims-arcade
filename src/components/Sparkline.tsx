interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

// A tiny inline trend line for "am I improving at this game" — deliberately
// bare-bones (no axes/labels/tooltips): just enough shape to read as
// "going up" or "going down" at a glance inside a small leaderboard card.
export default function Sparkline({ values, width = 84, height = 28, color = "#2ee6d6" }: SparklineProps) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lastX = (values.length - 1) * step;
  const lastY = height - ((values[values.length - 1] - min) / range) * (height - 4) - 2;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
    </svg>
  );
}
