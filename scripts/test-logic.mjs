// Quick logic test against Sex with Emily's real numbers (no framework, no install).
// Run: node scripts/test-logic.mjs
import { platformStats } from '../src/lib/cpm.js';
import { evaluateDeal, DEFAULT_TARGET_CPM } from '../src/lib/decision.js';
import { baseTemplates, ruleBasedReply, detectIntent } from '../src/lib/reply.js';

// Reconstruct view arrays whose median matches the dashboard screenshot:
// IG median 6,965 (avg 22,354), TikTok median 2,024 (avg 4,057).
const igViews = [209, 4000, 6965, 9000, 22354, 90000]; // median 6,965-ish, avg pulled up by outlier
const ttViews = [925, 1500, 2024, 2600, 4057, 9236];   // median ~2,300, avg ~4,057

const emily = {
  name: 'Sex with Emily',
  urls: { instagram: 'https://www.instagram.com/sexwithemily/' },
  platforms: {
    instagram: { videos: igViews.map((v) => ({ views: v })) },
    tiktok: { videos: ttViews.map((v) => ({ views: v })) },
  },
  costs: {
    costIgReel: 5000,
    costTiktok: 1000,
    costBundleAll: 3000,
  },
  targetCpms: {}, // none set -> uses DEFAULT_TARGET_CPM ($40)
};

console.log('=== VIEW STATS ===');
console.log('IG    ', platformStats(emily, 'instagram'));
console.log('TikTok', platformStats(emily, 'tiktok'));

const deal = evaluateDeal(emily);
console.log('\n=== PER-PACKAGE ===');
for (const p of deal.packages) {
  console.log(
    `${p.label.padEnd(20)} cost $${p.cost} | median ${Math.round(p.medianViews)} views | CPM $${p.actualCpm?.toFixed(2)} | target $${p.target}${p.usingDefaultTarget ? ' (default)' : ''} -> ${p.decision} | counter $${Math.round(p.counterPrice)}`
  );
}

console.log('\n=== OVERALL DECISION ===');
console.log(deal.overall.decision, '—', deal.overall.reason);

console.log('\n=== OPENING TEMPLATES ===');
for (const t of baseTemplates(emily.name, deal)) {
  console.log(`[${t.label}] ${t.body}\n`);
}

console.log('=== FOLLOW-UP (rule-based fallback) ===');
const theirReply = "Thanks! Our rate is pretty firm at $5,000 for the reel.";
console.log('Detected intent:', detectIntent(theirReply));
console.log('Suggested reply:', ruleBasedReply(emily.name, deal, theirReply));

console.log(`\n(Default target CPM = $${DEFAULT_TARGET_CPM})`);

// Whitelisting-aware evaluation: a WL cost adds a "+ WL" row judged
// against the with-usage-rights target (falling back to the base target).
console.log('\n=== WHITELISTING PACKAGES ===');
const wlCreator = {
  ...emily,
  costs: { costIgReel: 100, wlIg: 150 },
  targetCpms: { targetCpmInstagram: 15, targetCpmInstagramWl: 35 },
};
const wlDeal = evaluateDeal(wlCreator);
for (const p of wlDeal.packages) {
  console.log(
    `${p.label.padEnd(20)} cost $${p.cost} | CPM $${p.actualCpm?.toFixed(2)} | target $${p.target} -> ${p.decision}`
  );
}
const base = wlDeal.packages.find((p) => p.key === 'igReel');
const wl = wlDeal.packages.find((p) => p.key === 'igReelWl');
if (!wl) throw new Error('WL package missing');
if (wl.cost !== 250) throw new Error('WL cost should be base + WL (250), got ' + wl.cost);
if (wl.target !== 35) throw new Error('WL target should use targetCpmInstagramWl (35), got ' + wl.target);
if (base.cost !== 100) throw new Error('Base package cost changed unexpectedly');

console.log('\nOK — logic ran clean.');
