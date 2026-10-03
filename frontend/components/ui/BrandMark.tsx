export function BrandMark({ size = 28 }: { size?: number }) {
  const fontSize = Math.round((13 / 28) * size);
  const radius = Math.round((8 / 28) * size);

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: "#1C1A18",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontFamily: "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif",
        fontSize,
        fontWeight: 600,
        letterSpacing: 0,
      }}
      aria-hidden="true"
    >
      <span style={{ color: "#FFFFFF" }}>d</span>
      <span style={{ color: "#F26419" }}>.</span>
    </span>
  );
}
