export function normalizeMimeType(mimetype?: string): string {
  if (!mimetype) return "";

  const normalized = mimetype.split(";")[0].trim().toLowerCase();
  if (normalized === "image/jpg") return "image/jpeg";
  return normalized;
}
