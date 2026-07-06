const PALETTE = [
  "#3B5BDB",
  "#0C8599",
  "#2F9E44",
  "#E8590C",
  "#6741D9",
  "#C2255C",
  "#1098AD",
  "#5C940D",
];

function hash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function avatarColor(name: string): string {
  const key = name.trim() || "?";
  return PALETTE[hash(key) % PALETTE.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
