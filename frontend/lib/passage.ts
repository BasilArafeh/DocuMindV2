export function splitPassage(text: string): {
  before: string;
  quote: string;
  after: string;
} {
  const trimmed = text.trim();
  if (!trimmed) return { before: "", quote: "", after: "" };

  const blocks = trimmed.split(/\n+/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length >= 3) {
    return {
      before: blocks[0],
      quote: blocks.slice(1, -1).join("\n\n"),
      after: blocks[blocks.length - 1],
    };
  }

  const sentences = trimmed
    .split(/(?<=[.?!])\s+(?=[A-Z0-9“"'(])/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentences.length >= 3) {
    return {
      before: sentences[0],
      quote: sentences.slice(1, -1).join(" "),
      after: sentences[sentences.length - 1],
    };
  }

  if (sentences.length === 2) {
    return { before: sentences[0], quote: sentences[1], after: "" };
  }

  return { before: "", quote: trimmed, after: "" };
}

function firstLine(text: string) {
  return text.trim().split(/\n+/).filter(Boolean)[0] ?? "";
}

function lastLine(text: string) {
  const lines = text.trim().split(/\n+/).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

export function passageView(
  citation: { filename: string; chunkIndex: number; text?: string },
  all: Array<{ filename: string; chunkIndex: number; text?: string }>,
) {
  const prev = all.find(
    (item) =>
      item.filename === citation.filename && item.chunkIndex === citation.chunkIndex - 1,
  );
  const next = all.find(
    (item) =>
      item.filename === citation.filename && item.chunkIndex === citation.chunkIndex + 1,
  );

  if (prev?.text || next?.text) {
    return {
      before: lastLine(prev?.text ?? ""),
      quote: citation.text?.trim() ?? "",
      after: firstLine(next?.text ?? ""),
    };
  }

  return splitPassage(citation.text ?? "");
}

export function unusedCitationMarkers(content: string, ns: number[]): string {
  if (!ns.length) return content;
  const used = new Set(
    [...content.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])),
  );
  const missing = ns.filter((n) => !used.has(n));
  if (!missing.length) return content;
  return `${content.trimEnd()} ${missing.map((n) => `[${n}]`).join("")}`;
}
