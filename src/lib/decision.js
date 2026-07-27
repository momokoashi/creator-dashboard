// ============================================================
// Deal engine — turns costs + views + target CPM into a decision.
//
// Flow:  cost + median views  ->  CPM  ->  compare to target  ->  ACCEPT / COUNTER / PASS
//
// Rules (per package):
//   CPM <= target            -> ACCEPT  (at or better than we'll pay)
//   target < CPM <= 2*target -> COUNTER (offer target-priced counter)
//   CPM > 2*target           -> PASS    (way over; restructure or walk)
//
// Overall recommendation = the best outcome available across packages:
//   any ACCEPT -> ACCEPT that package · else any COUNTER -> COUNTER · else PASS
// ============================================================

import { platformStats, cpm } from './cpm.js';

/** Fallback target CPM ($) when none is set for a package's platform. */
export const DEFAULT_TARGET_CPM = 40;

// Each buyable package: which cost field, which platform's median views it earns,
// and which target-CPM field governs it. Bundles sum multiple platforms.
// wlField: the whitelisting cost that attaches to this package; wlTargetField:
// the with-usage-rights target that governs the combined price (falls back to
// the base target when unset).
const PACKAGES = [
  { key: 'igReel',    label: 'IG Reel',            costField: 'costIgReel',    platforms: ['instagram'],            targetField: 'targetCpmInstagram', wlField: 'wlIg',       wlTargetField: 'targetCpmInstagramWl' },
  { key: 'igReels',   label: 'IG Reels (package)', costField: 'costIgReels',   platforms: ['instagram'],            targetField: 'targetCpmIgReels',   wlField: 'wlIgReels',  wlTargetField: 'targetCpmIgReelsWl' },
  { key: 'tiktok',    label: 'TikTok',             costField: 'costTiktok',    platforms: ['tiktok'],               targetField: 'targetCpmTiktok',    wlField: 'wlTiktok',   wlTargetField: 'targetCpmTiktokWl' },
  { key: 'youtube',   label: 'YouTube',            costField: 'costYoutube',   platforms: ['youtube'],              targetField: 'targetCpmYoutube',   wlField: 'wlYoutube',  wlTargetField: 'targetCpmYoutubeWl' },
  { key: 'ytShorts',  label: 'YT Shorts',          costField: 'costYtShorts',  platforms: ['youtubeShorts'],        targetField: 'targetCpmYtShorts',  wlField: 'wlYtShorts', wlTargetField: 'targetCpmYtShortsWl' },
  { key: 'podcast',   label: 'Podcast',            costField: 'costPodcast',   platforms: ['podcast'],              targetField: 'targetCpmPodcast' },
  { key: 'bundleIgTt',label: 'Bundle (IG + TikTok)',costField: 'costBundleIgTt',platforms: ['instagram', 'tiktok'], targetField: 'targetCpmInstagram', wlField: 'wlBundle',   wlTargetField: 'targetCpmInstagramWl' },
  { key: 'bundleAll', label: 'Full Bundle (All)',  costField: 'costBundleAll', platforms: ['instagram', 'tiktok', 'youtube', 'youtubeShorts'], targetField: 'targetCpmInstagram', wlField: 'wlBundle', wlTargetField: 'targetCpmInstagramWl' },
];

/**
 * Combined view stats across one or more platforms.
 * `adjusted` scales each platform's median by its sponsored-post factor
 * (what a branded post really does vs organic) when one is measurable —
 * that's the number a paid deal should be priced on.
 */
function combinedViews(creator, platforms) {
  let raw = 0;
  let adjusted = 0;
  let anyFactor = false;
  for (const pk of platforms) {
    const s = platformStats(creator, pk);
    raw += s.median;
    if (s.sponsoredFactor != null) anyFactor = true;
    adjusted += s.median * (s.sponsoredFactor ?? 1);
  }
  return { raw, adjusted: Math.round(adjusted), anyFactor };
}

/** Score one price against a target CPM on the median views seen. */
function judge(cost, medianViews, target) {
  const actualCpm = cpm(cost, medianViews); // null when no views yet
  let decision = 'UNKNOWN';
  let counterPrice = null;
  if (actualCpm != null) {
    if (actualCpm <= target) decision = 'ACCEPT';
    else if (actualCpm <= target * 2) decision = 'COUNTER';
    else decision = 'PASS';
    // A fair counter pays exactly the target CPM on the median views seen.
    counterPrice = (target * medianViews) / 1000;
  }
  return { actualCpm, decision, counterPrice };
}

/**
 * Evaluate one package. Returns [] if the package has no cost set
 * (nothing to decide on); otherwise the content-only evaluation plus,
 * when a whitelisting cost is set, a second "+ WL" evaluation of the
 * combined price against the with-usage-rights target.
 */
function evaluatePackage(creator, pkg) {
  const costs = creator.costs || {};
  const targets = creator.targetCpms || {};
  const cost = Number(costs[pkg.costField]) || 0;
  if (cost <= 0) return [];

  const { raw, adjusted, anyFactor } = combinedViews(creator, pkg.platforms);
  // Price on what a *sponsored* post is expected to do, not the organic median.
  const dealViews = anyFactor ? adjusted : raw;
  const target = Number(targets[pkg.targetField]) || DEFAULT_TARGET_CPM;

  const results = [{
    key: pkg.key,
    label: pkg.label,
    cost,
    medianViews: dealViews,
    rawMedianViews: raw,
    sponsoredAdjusted: anyFactor,
    target,
    usingDefaultTarget: !targets[pkg.targetField],
    ...judge(cost, dealViews, target),
  }];

  const wlCost = pkg.wlField ? Number(costs[pkg.wlField]) || 0 : 0;
  if (wlCost > 0) {
    const wlTarget = Number(targets[pkg.wlTargetField]) || target;
    results.push({
      key: pkg.key + 'Wl',
      label: pkg.label + ' + WL',
      cost: cost + wlCost,
      medianViews: dealViews,
      rawMedianViews: raw,
      sponsoredAdjusted: anyFactor,
      target: wlTarget,
      usingDefaultTarget: !targets[pkg.wlTargetField] && !targets[pkg.targetField],
      ...judge(cost + wlCost, dealViews, wlTarget),
    });
  }

  return results;
}

const RANK = { ACCEPT: 3, COUNTER: 2, PASS: 1, UNKNOWN: 0 };

/**
 * Evaluate an entire creator deal.
 * @returns {{
 *   packages: object[],
 *   overall: {decision:string, package:object|null, reason:string} | null
 * }}
 */
export function evaluateDeal(creator) {
  const packages = PACKAGES.flatMap((p) => evaluatePackage(creator, p));

  if (!packages.length) {
    return { packages: [], overall: null };
  }

  // Pick the best outcome. Among equal outcomes, prefer the cheaper CPM (better value).
  const ranked = [...packages].sort((a, b) => {
    if (RANK[b.decision] !== RANK[a.decision]) return RANK[b.decision] - RANK[a.decision];
    return (a.actualCpm ?? Infinity) - (b.actualCpm ?? Infinity);
  });
  const best = ranked[0];

  let reason;
  if (best.decision === 'ACCEPT') {
    reason = `${best.label} clears your target (${fmt(best.actualCpm)} CPM ≤ ${fmt(best.target)} target). Accept at ${money(best.cost)}.`;
  } else if (best.decision === 'COUNTER') {
    reason = `Nothing clears target, but ${best.label} is close (${fmt(best.actualCpm)} CPM vs ${fmt(best.target)}). Counter at ~${money(best.counterPrice)}.`;
  } else if (best.decision === 'PASS') {
    reason = `All packages are 2×+ over target (best is ${best.label} at ${fmt(best.actualCpm)} CPM vs ${fmt(best.target)}). Pass or restructure to affiliate.`;
  } else {
    reason = `Add view data to compute a CPM for ${best.label}.`;
  }

  return { packages, overall: { decision: best.decision, package: best, reason } };
}

// Tiny local formatters (kept here so this module is UI-independent).
function fmt(n) { return n == null ? '—' : '$' + Number(n).toFixed(2); }
function money(n) { return n == null ? '—' : '$' + Math.round(n).toLocaleString(); }
