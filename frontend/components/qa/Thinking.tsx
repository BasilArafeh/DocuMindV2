export function Thinking() {
  return (
    <span
      className="thinking-dots"
      aria-label="Thinking"
      style={{
        display: "inline-flex",
        gap: 4,
        color: "#8A8A8A",
        fontSize: 18,
        lineHeight: 1,
        letterSpacing: 0,
      }}
    >
      <span>•</span>
      <span>•</span>
      <span>•</span>
    </span>
  );
}
