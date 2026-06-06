const DEFAULT_COLORS = { background: '#e7f5ff', color: '#1864ab' };

export function authorInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

function hashUsername(key: string): number {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 33) ^ key.charCodeAt(i);
  }
  return Math.abs(hash);
}

/** Stable avatar colors per username (case-insensitive). Scales beyond a fixed palette via HSL hue. */
export function authorAvatarColors(name: string): { background: string; color: string } {
  const key = name.trim().toLowerCase();
  if (!key) return DEFAULT_COLORS;

  const hash = hashUsername(key);
  const hue = hash % 360;
  const satShift = (hash >> 8) % 12;
  const bgSat = 68 + satShift;
  const fgSat = 48 + satShift;

  return {
    background: `hsl(${hue}, ${bgSat}%, 91%)`,
    color: `hsl(${hue}, ${fgSat}%, 30%)`,
  };
}
