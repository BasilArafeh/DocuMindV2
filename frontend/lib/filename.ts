/** Build a clean, user-facing filename for UI labels. */
export function cleanDisplayFilename(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return name;

  const lastDot = trimmed.lastIndexOf(".");
  const extension = lastDot > 0 ? trimmed.slice(lastDot) : "";
  let base = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;

  // Leading UUID prefixes (legacy storage names).
  base = base
    .replace(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[-_.\s]*/i,
      "",
    )
    .replace(/^[0-9a-f]{32}[-_.\s]*/i, "");

  // UUID / hash suffix before the extension: name-<hex id>
  base = base.replace(/-[a-f0-9]{8,}$/i, "");

  if (!base) return trimmed;

  base = base.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  if (!base) return trimmed;

  const cleaned = base.charAt(0).toUpperCase() + base.slice(1);
  return `${cleaned}${extension}`;
}

/** Prefer original upload name fields, then clean for display. */
export function documentDisplayName(doc: {
  filename: string;
  displayName?: string;
  originalName?: string;
  originalFilename?: string;
}): string {
  const raw =
    doc.displayName ||
    doc.originalName ||
    doc.originalFilename ||
    doc.filename;
  return cleanDisplayFilename(raw);
}
