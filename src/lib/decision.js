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
const PACKAGES = [
  { key: 'igReel',    label: 'IG Reel',            costField: 'costIgReel',    platforms: ['instagram'],            targetField: 'targetCpmInstagram' },
  { key: 'igReels',   label: 'IG Reels (package)', costField: 'costIgReels',   platforms: ['instagram'],            targetField: 'targetCpmIgReels' },
  { key: 'tiktok',    label: 'TikTok',             costField: 'costTiktok',    platforms: ['tiktok'],               targetField: 'targetCpmTiktok' },
  { key: 'youtube',   label: 'YouTube',            costField: 'costYoutube',   platforms: ['youtube'],              targetField: 'targetCpmYoutube' },
  { key: 'ytShorts',  label: 'YT Shorts',          costField: 'costYtShorts',  platforms: ['youtubeShorts'],        targetField: 'targetCpmYtShorts' },
  { key: 'podcast',   label: 'Podcast',            costField: 'costPodcast',   platforms: ['podcast'],              targetField: 'targetCpmPodcast' },
  { key: 'bundleIgTt',label: 'Bundle (IG + TikTok)',costField: 'costBundleIgTt',platforms: ['instagram', 'tiktok'], targetField: 'targetCpmInstagram' },
  { key: 'bundleAll', label: 'Full Bundle (All)',  costField: 'costBundleAll', platforms: ['instagram', 'tiktok', 'youtube', 'youtubeShorts'], targetField: 'targetCpmInstagram' },
];

/** Sum of median views across one or more platforms. */
function combinedMedian(creator, platforms) {
  return platforms.reduce((sum, pk) => sum + platformStats(creator, pk).median, 0);
}

/**
 * Evaluate one package. Returns null if the package has no cost set
 * (nothing to decide on).
 */
function evaluatePackage(creator, pkg) {
  const costs = creator.costs || {};
  const targets = creator.targetCpms || {};
  const cost = Number(costs[pkg.costField]) || 0;
  if (cost <= 0) return null;

  const medianViews = combinedMedian(creator, pkg.platforms);
  const actualCpm = cpm(cost, medianViews); // null when no views yet
  const target = Number(targets[pkg.targetField]) || DEFAULT_TARGET_CPM;

  let decision = 'UNKNOWN';
  let counterPrice = null;
  if (actualCpm != null) {
    if (actualCpm <= target) decision = 'ACCEPT';
    else if (actualCpm <= target * 2) decision = 'COUNTER';
    else decision = 'PASS';
    // A fair counter pays exactly the target CPM on the median views seen.
    counterPrice = (target * medianViews) / 1000;
  }

  return {
    key: pkg.key,
    label: pkg.label,
    cost,
    medianViews,
    actualCpm,
    target,
    usingDefaultTarget: !targets[pkg.targetField],
    decision,
    counterPrice,
  };
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
  const packages = PACKAGES
    .map((p) => evaluatePackage(creator, p))
    .filter(Boolean);

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
