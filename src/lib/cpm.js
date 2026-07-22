// ============================================================
// CPM math — the single source of truth for view stats + CPM.
// Median is what we optimise for; average/min are secondary.
// ============================================================

/** @returns {number[]} numeric view counts for a platform, ignoring blanks. */
function viewsOf(creator, platformKey) {
  const p = creator?.platforms?.[platformKey];
  if (!p || !Array.isArray(p.videos)) return [];
  return p.videos
    .map((v) => Number(v?.views))
    .filter((n) => !isNaN(n) && n > 0);
}

/** Median of a numeric array (0 if empty). */
export function median(nums) {
  const arr = nums.filter((n) => !isNaN(n)).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

/** Mean of a numeric array (0 if empty). */
export function average(nums) {
  const arr = nums.filter((n) => !isNaN(n));
  if (!arr.length) return 0;
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

/**
 * View stats for one platform.
 * @returns {{median:number, average:number, min:number, count:number}}
 */
export function platformStats(creator, platformKey) {
  const v = viewsOf(creator, platformKey);
  return {
    median: median(v),
    average: average(v),
    min: v.length ? Math.min(...v) : 0,
    count: v.length,
  };
}

/**
 * CPM = cost per 1,000 views. Returns null when it can't be computed
 * (no cost or no views) so the UI can show "—" instead of Infinity.
 */
export function cpm(cost, views) {
  if (!cost || !views || views <= 0) return null;
  return (cost / views) * 1000;
}
