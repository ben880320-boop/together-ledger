/**
 * GitHub Release 曾經使用累積式說明。顯示歷程時只保留目前 tag 的段落，
 * 同時相容只含單一版本說明的正常 Release body。
 */
export function extractVersionNotes(body: string | null | undefined, tagName: string | null | undefined): string {
  const source = body?.trim() || "";
  const version = tagName?.trim().replace(/^v/i, "");
  if (!source || !version) return source;

  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`^##\\s+(?:Together Ledger\\s+)?v${escapedVersion}\\b[^\\n]*\\n?`, "im");
  const match = heading.exec(source);
  if (!match || match.index === undefined) return source;

  const notesStart = match.index + match[0].length;
  const remaining = source.slice(notesStart);
  const nextHeading = remaining.search(/^##\s+(?:Together Ledger\s+)?v\d+(?:\.\d+)+\b[^\n]*$/im);
  return remaining.slice(0, nextHeading >= 0 ? nextHeading : undefined).trim() || source;
}
