export function Message({ id, children }: { id?: string; children: string }) {
  return (
    <div className="flex justify-end" data-msg={id} style={{ marginBottom: 28 }}>
      <div
        style={{
          alignSelf: "flex-end",
          maxWidth: "65%",
          background: "#1C1A18",
          color: "#FFFFFF",
          borderRadius: 16,
          borderBottomRightRadius: 4,
          padding: "12px 18px",
          fontSize: 14,
          lineHeight: 1.6,
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        }}
        dir="auto"
      >
        <p className="whitespace-pre-wrap">{children}</p>
      </div>
    </div>
  );
}
