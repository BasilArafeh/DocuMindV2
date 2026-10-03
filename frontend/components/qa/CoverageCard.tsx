const TONES = ["#F26419", "#F9A86A", "#FBBF8E"] as const;

export function CoverageCard({
  cited,
  total,
  bars,
}: {
  cited: number;
  total: number;
  bars: number[];
}) {
  if (!total) return null;

  const sum = bars.reduce((acc, value) => acc + value, 0);
  const widths =
    sum > 0
      ? bars.map((value) => (value / sum) * 100)
      : bars.map(() => 100 / Math.max(bars.length, 1));

  return (
    <div style={{ padding: "12px 16px" }}>
      <p
        style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#6B7280",
        }}
      >
        Coverage
      </p>
      <div
        style={{
          marginTop: 8,
          display: "flex",
          height: 4,
          overflow: "hidden",
          borderRadius: 2,
          background: "#2E2A26",
        }}
      >
        {widths.map((width, index) => (
          <span
            key={`${width}-${index}`}
            className="cover-seg"
            style={{
              height: "100%",
              width: `${width}%`,
              background: TONES[index % TONES.length],
              animationDelay: `${index * 80}ms`,
            }}
          />
        ))}
      </div>
      <p style={{ marginTop: 8, fontSize: 11, color: "#9CA3AF" }}>
        Uses {cited} of {total} {total === 1 ? "document" : "documents"}
      </p>
    </div>
  );
}
