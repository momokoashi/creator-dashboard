// ============================================================
// Data store — the ONLY place that knows how creators are persisted.
//
// Today: browser localStorage (per-device).
// Tomorrow: swap the four functions below for fetch() calls to a shared
// backend (Supabase / a tiny JSON API) and the whole UI keeps working
// unchanged. This is the seam that makes the tool team-shareable later.
// ============================================================

const STORAGE_KEY = 'creator-dashboard-data'; // same key as v1 -> existing data is preserved

/** @returns {object[]} all creators (empty array if none/parse error). */
export function loadCreators() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(migrate) : [];
  } catch {
    return [];
  }
}

/** Persist the full creator list. */
export function saveCreators(creators) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creators));
  } catch (e) {
    console.error('saveCreators failed', e);
  }
}

export function newCreatorId() {
  // Time + randomness; unique enough for a single-user list.
  return 'cr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Forward-compatible defaults so old v1 records don't crash the new UI.
 * Never drops unknown fields.
 */
function migrate(c) {
  return {
    id: c.id || newCreatorId(),
    name: c.name || 'Untitled',
    bio: c.bio || '',
    urls: c.urls || {},
    platforms: c.platforms || {},
    costs: c.costs || {},
    targetCpms: c.targetCpms || {},
    // v2 additions:
    override: c.override || null, // { decision, note } manual brand-fit override
    conversations: c.conversations || [], // saved reply threads
    ...c,
  };
}
