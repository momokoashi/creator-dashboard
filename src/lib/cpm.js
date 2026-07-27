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

/**
 * Is this video sponsored? A manual tag (v.sponsored true/false, set by
 * clicking in the video list) always beats caption auto-detection — captions
 * miss "Paid partnership" label-only posts and undisclosed ads.
 */
export function isSponsored(v) {
  if (v?.sponsored === true) return true;
  if (v?.sponsored === false) return false;
  return SPONSORED_RE.test(v?.title || '');
}

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
  // One tagged ad post is enough to start factoring (better than ignoring the
  // user's tag entirely) — flagged low-confidence until there are 3+.
  const sponsViews = eligible.filter(isSponsored).map((v) => Number(v.views));
  const organicViews = eligible.filter((v) => !isSponsored(v)).map((v) => Number(v.views));
  const sponsoredMedian = sponsViews.length ? median(sponsViews) : 0;
  const organicMedian = organicViews.length ? median(organicViews) : 0;
  const sponsoredFactor =
    sponsViews.length >= 1 && organicViews.length >= 2 && organicMedian > 0
      ? sponsoredMedian / organicMedian
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
    sponsoredLowConfidence: sponsoredFactor != null && sponsViews.length < 3,
    sponsoredCount: sponsViews.length,
    sponsoredMedian,
    organicMedian,
    // What to price a paid post on: the sponsored posts' own median when we
    // have one (the direct evidence), else the overall median.
    dealViews: sponsoredFactor != null ? sponsoredMedian : med,
    engagementRate: Number(p.engagementRate) || 0,
  };
}

// ============================================================
// Engagement quality — discount-only adjustment on the target CPM.
// Poor engagement knocks up to 10% off what we'll pay per view; good
// engagement earns no premium (we don't pay extra for likes — reach is
// the primary axis and strong engagement is simply expected).
// Baselines differ because each platform's rate is computed differently
// at fetch time (IG: engagement/followers; TikTok & YouTube: engagement/views).
// ============================================================
const ENG_BASELINES = {
  instagram: { poor: 1, healthy: 2.5 },
  tiktok: { poor: 3, healthy: 5 },
  youtube: { poor: 2, healthy: 4 },
  youtubeShorts: { poor: 2, healthy: 4 },
};

export function engagementFactor(platformKey, rate) {
  const b = ENG_BASELINES[platformKey];
  if (!b || !rate || rate <= 0) return 1;
  if (rate <= b.poor) return 0.9;
  if (rate >= b.healthy) return 1;
  return 0.9 + ((rate - b.poor) / (b.healthy - b.poor)) * 0.1;
}

/**
 * CPM = cost per 1,000 views. Returns null when it can't be computed
 * (no cost or no views) so the UI can show "—" instead of Infinity.
 */
export function cpm(cost, views) {
  if (!cost || !views || views <= 0) return null;
  return (cost / views) * 1000;
}
