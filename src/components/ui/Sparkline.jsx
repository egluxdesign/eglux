// src/components/ui/Sparkline.jsx
// ============================================================================
// Sparkline — Mini trend chart untuk KPI cards (no library, pure SVG)
// ============================================================================
//
// Cara pakai:
//   import Sparkline from '../components/ui/Sparkline';
//
//   <Sparkline
//     data={[3, 5, 4, 6, 5, 7, 8, 6, 7, 9]}
//     width={80}
//     height={20}
//     color="#10b981"  // green
//   />
//
// Props:
//   data: number[]       — array of values (min 2 points)
//   width: number        — default 80
//   height: number       — default 20
//   color: string        — line color (hex/rgb), default '#9a7d4a' (eglux secondary)
//   fill: boolean        — fill area under line, default true
//   showDot: boolean     — show dot at last point, default true
// ============================================================================

const Sparkline = ({
  data = [],
  width = 80,
  height = 20,
  color = '#9a7d4a',
  fill = true,
  showDot = true,
}) => {
  // Edge case: not enough data
  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height} className="inline-block">
        <line
          x1={0} y1={height / 2}
          x2={width} y2={height / 2}
          stroke="#e5e7eb"
          strokeWidth={1}
          strokeDasharray="2,2"
        />
      </svg>
    );
  }

  const max = Math.max(...data, 0.001); // avoid div by 0
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  // Build points array
  const points = data.map((value, i) => {
    const x = i * stepX;
    // Normalize: max → top (y=0), min → bottom (y=height)
    const y = height - ((value - min) / range) * (height - 2) - 1;
    return { x, y, value };
  });

  // Build path string
  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');

  // Build fill path (area under line)
  const fillPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  // Last point (for dot)
  const lastPoint = points[points.length - 1];

  // Gradient ID (unique per instance)
  const gradientId = `spark-grad-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <svg width={width} height={height} className="inline-block overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Fill area */}
      {fill && (
        <path d={fillPath} fill={`url(#${gradientId})`} />
      )}

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dot at last point */}
      {showDot && (
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r={2}
          fill={color}
        />
      )}
    </svg>
  );
};

export default Sparkline;
