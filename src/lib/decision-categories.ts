const PALETTE = [
  'oklch(0.48 0.16 265)',
  'oklch(0.62 0.13 195)',
  'oklch(0.70 0.14 70)',
  'oklch(0.60 0.15 150)',
  'oklch(0.58 0.18 20)',
  'oklch(0.55 0.12 320)'
];

/** Group decisions by their real category (top 5 + "Other"), as rounded percentages. */
export function buildCategoryDistribution(
  decisions: Array<{ category?: string | null }>
): Array<{ category: string; value: number; fill: string }> {
  const total = decisions.length;
  if (total === 0) return [];
  const counts = new Map<string, number>();
  for (const d of decisions) {
    const raw = (d.category || '').trim();
    const key = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Uncategorized';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 5);
  const other = sorted.slice(5).reduce((n, [, c]) => n + c, 0);
  if (other > 0) top.push(['Other', other]);
  return top.map(([category, count], i) => ({
    category,
    value: Math.max(1, Math.round((count / total) * 100)),
    fill: PALETTE[i % PALETTE.length]
  }));
}
