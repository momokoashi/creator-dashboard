// ============================================================
// CPM math — the single source of truth for view stats + CPM.
// Median is what we optimise for; average/min are secondary.
//
// platformStats also derives the deal-quality signals:
//   - posts <24h old are excluded (views still accruing would drag
//     the median down and make us underprice)
//   - the median uses the newest 10 eligible videos; videos 11-20
//     (when the API returned them) feed the trend comparison
//   - sponsored posts (#ad etc.) are compared against organic to get
//     an "ad factor" — what a paid post really does vs their organic
// ============================================================

const FRESH_MS = 24 * 60 * 60 * 1000; // 24h — user-chosen cutoff

// Caption markers that identify a sponsored/branded post.
const SPONSORED_RE = /#ad\b|#sponsored\b|#sponsor\b|#gifted\b|#brandpartner\b|paid partnership|in partnership with|#partner\b/i;

/** @returns {object[]} eligible (>24h old or undated) videos with numeric views. */
function eligibleVideos(creator, platformKey) {
  const p = creator?.platforms?.[platformKey];
  if (!p || !Array.isArray(p.videos)) return [];
  const now = Date.now();
  return p.videos.filter((v) => {
    const views = Number(v?.views);
    if (isNaN(views) || views <= 0) return false;
    // Undated entries (manual CSV input) can't be age-checked — keep them.
    if (!v.publishedAt) return true;
    const age = now - new Date(v.publishedAt).getTime();
    return isNaN(age) || age >= FRESH_MS;
  });
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
 * View stats + deal signals for one platform.
 * Median/average/min/count cover the newest 10 eligible videos (the
 * playbook's "last 10, no pins" — pins are filtered at fetch time).
 */
export function platformStats(creator, platformKey) {
  const p = creator?.platforms?.[platformKey] || {};
  const all = (Array.isArray(p.videos) ? p.videos : []).filter((v) => Number(v?.views) > 0);
  const eligible = eligibleVideos(creator, platformKey);
  const freshSkipped = all.length - eligible.length;

  const primary = eligible.slice(0, 10);
  const views = primary.map((v) => Number(v.views));
  const med = median(views);

  // Volatility: the range after dropping the single best and worst video —
  // "8 of 10 land between low and high". Wide range => write a view floor.
  const sorted = [...views].sort((a, b) => a - b);
  const typicalLow = sorted.length >= 5 ? sorted[1] : (sorted[0] ?? 0);
  const typicalHigh = sorted.length >= 5 ? sorted[sorted.length - 2] : (sorted[sorted.length - 1] ?? 0);

  // Trend: newest 10 vs the 10 before them when the fetch went deep enough;
  // otherwise newest half vs oldest half of what we have.
  let trendPct = null;
  const extra = eligible.slice(10, 20).map((v) => Number(v.views));
  if (extra.length >= 4) {
    const mPrior = median(extra);
    if (mPrior > 0) trendPct = ((med - mPrior) / mPrior) * 100;
  } else if (views.length >= 6) {
    const half = Math.floor(views.length / 2);
    const mPrior = median(views.slice(half));
    if (mPrior > 0) trendPct = ((median(views.slice(0, half)) - mPrior) / mPrior) * 100;
  }

  // Sponsored vs organic: what does a branded post really do on this account?
  const sponsViews = eligible.filter((v) => SPONSORED_RE.test(v?.title || '')).map((v) => Number(v.views));
  const organicViews = eligible.filter((v) => !SPONSORED_RE.test(v?.title || '')).map((v) => Number(v.views));
  const sponsoredFactor =
    sponsViews.length >= 2 && organicViews.length >= 2 && median(organicViews) > 0
      ? median(sponsViews) / median(organicViews)
      : null;

  const followers = Number(p.followers) || 0;

  return {
    median: med,
    average: average(views),
    min: views.length ? Math.min(...views) : 0,
    max: views.length ? Math.max(...views) : 0,
    count: views.length,
    freshSkipped,
    typicalLow,
    typicalHigh,
    trendPct,
    reachRate: followers > 0 && med > 0 ? (med / followers) * 100 : null,
    sponsoredFactor,
    sponsoredCount: sponsViews.length,
    sponsoredMedian: sponsViews.length ? median(sponsViews) : 0,
    organicMedian: organicViews.length ? median(organicViews) : 0,
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
