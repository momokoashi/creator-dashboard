// ============================================================
// Reply engine — turns a decision into outreach copy.
//
// Two layers:
//   1. baseTemplates(deal)      -> ready-to-send opening messages per decision
//   2. ruleBasedReply(...)      -> deterministic follow-up when the creator replies
//   3. buildAiPrompt(...)       -> prompt sent to Claude for a tailored draft
//                                  (server calls Claude; this stays UI/runtime independent)
// ============================================================

function money(n) { return n == null ? '—' : '$' + Math.round(n).toLocaleString(); }
function cpmStr(n) { return n == null ? '—' : '$' + Number(n).toFixed(2); }

/**
 * Opening templates keyed by decision, pre-filled with deal facts.
 * `best` is deal.overall.package.
 */
export function baseTemplates(creatorName, deal, brand = 'Hello Nancy') {
  const best = deal?.overall?.package;
  const name = creatorName || 'there';
  if (!best) {
    return [{
      id: 'need-data',
      label: 'Need data',
      body: `Hi ${name} — could you share recent view averages so we can put together a fair offer? Thanks!`,
    }];
  }

  switch (deal.overall.decision) {
    case 'ACCEPT':
      return [{
        id: 'accept',
        label: 'Accept',
        body: `Hi ${name} — these numbers work great for us. We'd love to move forward with the ${best.label} at ${money(best.cost)}. I'll send over the brief, product, and timeline today. Excited to work with you!`,
      }];
    case 'COUNTER':
      return [
        {
          id: 'counter-flat',
          label: 'Counter (flat)',
          body: `Hi ${name} — we love the audience and the fit with ${brand}. Based on recent view performance, our budget for this slot lands around ${money(best.counterPrice)} (a ${cpmStr(best.target)} CPM on median views). Could we make the ${best.label} work at that number?`,
        },
        {
          id: 'counter-perf',
          label: 'Counter (base + bonus)',
          body: `Hi ${name} — big fans of your work. We'd love to structure this as a base of ${money(best.counterPrice)} plus a per-view or affiliate bonus, so it scales with performance. That keeps us aligned and rewards a strong post. Open to it?`,
        },
      ];
    case 'PASS':
      return [
        {
          id: 'pass-affiliate',
          label: 'Restructure (affiliate)',
          body: `Hi ${name} — we're big fans and think the brand fit is fantastic. A flat buy is above where our paid CPM lands right now, but we'd love to set you up with product + an affiliate commission + paid amplification behind whatever performs. Interested?`,
        },
        {
          id: 'pass-polite',
          label: 'Polite pass',
          body: `Hi ${name} — thank you so much for the details! The rate is a bit outside our budget for this campaign, but we'd love to stay in touch for future collaborations. Really appreciate you.`,
        },
      ];
    default:
      return [];
  }
}

/**
 * Detect the creator's intent from their reply so a follow-up can branch.
 * @returns {'accept'|'negotiate'|'firm'|'decline'|'question'|'unknown'}
 */
export function detectIntent(text) {
  const t = (text || '').toLowerCase();
  if (!t.trim()) return 'unknown';
  if (/\b(no thanks|not interested|pass|decline|can't do|cannot do)\b/.test(t)) return 'decline';
  if (/\b(deal|sounds good|works for me|let's do it|agreed|happy to|yes)\b/.test(t)) return 'accept';
  if (/\b(firm|final|non-negotiable|lowest i can|can't go lower|rate is set)\b/.test(t)) return 'firm';
  if (/\b(discount|budget|lower|come down|flexible|meet.*middle|counter|negotiat)\b/.test(t)) return 'negotiate';
  if (/\?/.test(t) || /\b(what|when|how|which|deliverable|timeline|usage)\b/.test(t)) return 'question';
  return 'unknown';
}

/**
 * Deterministic fallback used when the AI draft is unavailable (no API key
 * or an error). Always returns something usable.
 */
export function ruleBasedReply(creatorName, deal, theirReply, brand = 'Hello Nancy') {
  const best = deal?.overall?.package;
  const name = creatorName || 'there';
  const intent = detectIntent(theirReply);

  switch (intent) {
    case 'accept':
      return `Amazing, ${name}! Let's lock it in. I'll send the brief, product, timeline, and any usage terms today. Anything you need from us to get started?`;
    case 'decline':
      return `Totally understand, ${name} — thank you for considering it! We'd love to keep the door open for future ${brand} campaigns. Wishing you all the best.`;
    case 'firm':
      return best
        ? `Appreciate you being straight with me, ${name}. That rate is above where our CPM lands for this slot, so could we bridge the gap with a base of ${money(best.counterPrice)} plus an affiliate bonus? That way a strong post earns more without the upfront risk on our side.`
        : `Appreciate the clarity, ${name}. Let me take this back to the team and come back with what we can do.`;
    case 'negotiate':
      return best
        ? `Thanks for the flexibility, ${name}! Where we land comfortably is around ${money(best.counterPrice)} for the ${best.label} (that's a ${cpmStr(best.target)} CPM on your median views). If we can meet there, we're ready to move this week.`
        : `Thanks for the flexibility, ${name}! Let's find a number that works — what range were you thinking?`;
    case 'question':
      return `Great question, ${name} — happy to clarify. Here's how we're thinking about it${best ? ` for the ${best.label}` : ''}: [answer their question]. Let me know if that helps and we'll get the paperwork moving.`;
    default:
      return `Thanks, ${name}! ${best ? `For the ${best.label}, we're aiming around ${money(best.counterPrice)} (${cpmStr(best.target)} CPM on median views). ` : ''}Would that work on your end?`;
  }
}

/**
 * Build the prompt for Claude to draft a tailored reply. Kept here so both
 * the server and tests can construct it identically.
 */
export function buildAiPrompt(creatorName, deal, theirReply, brand = 'Hello Nancy', history = []) {
  const best = deal?.overall?.package;
  const facts = best
    ? [
        `Recommended package: ${best.label}`,
        `Their asking price: ${money(best.cost)}`,
        `Median-view CPM at that price: ${cpmStr(best.actualCpm)}`,
        `Our target CPM: ${cpmStr(best.target)}`,
        `Our decision: ${deal.overall.decision}`,
        best.counterPrice != null ? `Fair counter price (target CPM × median views): ${money(best.counterPrice)}` : null,
      ].filter(Boolean).join('\n')
    : 'No deal numbers computed yet.';

  // Earlier exchanges (newest last) so follow-ups stay consistent with what
  // we already said — no re-opening at a number we've moved past.
  const past = (history || [])
    .slice(-3)
    .map((h, i) => `Exchange ${i + 1}:\nThem: "${h.theirReply || '(screenshot only)'}"\nUs: "${h.draft || ''}"`)
    .join('\n\n');

  return [
    `You are a partnerships manager for ${brand}, a women's sexual-wellness brand.`,
    `Write a warm, concise, professional reply to a creator named "${creatorName}".`,
    `Keep it under 90 words. Be friendly, not corporate. Never invent numbers — only use the ones below.`,
    ``,
    `DEAL CONTEXT:`,
    facts,
    past ? `\nEARLIER EXCHANGES IN THIS NEGOTIATION (stay consistent with what we already offered):\n${past}` : null,
    ``,
    `THE CREATOR JUST REPLIED:`,
    `"""${theirReply || '(no message yet — write the opening outreach)'}"""`,
    ``,
    `Write only the reply text, ready to send.`,
  ].filter((l) => l != null).join('\n');
}
