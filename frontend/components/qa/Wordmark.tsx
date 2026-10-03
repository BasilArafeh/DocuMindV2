export { BrandMark } from "@/components/ui/BrandMark";

export function Wordmark() {
  return (
    <span
      style={{
        fontFamily: "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif",
        fontSize: 16,
        fontWeight: 600,
        letterSpacing: 0,
      }}
    >
      <span style={{ color: "#9CA3AF" }}>docu</span>
      <span style={{ color: "#F26419" }}>mind</span>
    </span>
  );
}

export function DocuMark({ size = 26 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center bg-[var(--ink)] text-[12px] font-medium text-white"
      style={{ width: size, height: size, borderRadius: 8 }}
      aria-hidden="true"
    >
      d
      <span className="absolute right-0.5 bottom-0.5 h-1 w-1 rounded-full bg-[var(--orange)]" />
    </span>
  );
}
