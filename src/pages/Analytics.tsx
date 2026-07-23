import { useState } from 'react';
import { platformStats } from '../lib/cpm.js';
import { formatNumber } from '../lib/format.js';

// Target CPM inputs — these replace the old CPM calculator.
const TARGETS = [
  ['targetCpmInstagram', 'IG Reel'],
  ['targetCpmIgReels', 'IG Reels (pkg)'],
  ['targetCpmTiktok', 'TikTok'],
  ['targetCpmYoutube', 'YouTube'],
  ['targetCpmYtShorts', 'YT Shorts'],
  ['targetCpmPodcast', 'Podcast'],
];

// With-usage-rights targets — govern the "+ WL" rows in Deal Analysis.
const WL_TARGETS = [
  ['targetCpmInstagramWl', 'IG Reel + WL'],
  ['targetCpmIgReelsWl', 'IG Reels + WL'],
  ['targetCpmTiktokWl', 'TikTok + WL'],
  ['targetCpmYoutubeWl', 'YouTube + WL'],
  ['targetCpmYtShortsWl', 'YT Shorts + WL'],
];

// Platforms shown as analytics cards. `fetch` = endpoint config or null (manual only).
const PLATFORMS = [
  { key: 'instagram', label: 'Instagram', urlKey: 'instagram', fetch: (h) => `/api/instagram/profile?username=${encodeURIComponent(h)}` },
  { key: 'tiktok', label: 'TikTok', urlKey: 'tiktok', fetch: (h) => `/api/tiktok/profile?username=${encodeURIComponent(h)}` },
  { key: 'youtube', label: 'YouTube', urlKey: 'youtube', fetch: (h) => `/api/youtube/channel?url=${encodeURIComponent(h)}` },
  { key: 'youtubeShorts', label: 'YT Shorts', urlKey: 'youtube', fetch: null },
  { key: 'podcast', label: 'Podcast', urlKey: 'podcast', fetch: null },
];

/** Fetch one platform's live stats; returns the platform patch or throws. */
async function fetchPlatformData(p, handle) {
  const res = await fetch(p.fetch(handle));
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Fetch failed');
  return json;
}

function toPatch(json, existing, useShorts) {
  const videos = (useShorts ? json.shorts : json.videos) || [];
  return {
    followers: json.followers ?? existing.followers,
    engagementRate: json.engagementRate ?? existing.engagementRate,
    videos: videos.map((v) => ({ views: Number(v.views) || 0 })),
    fetchedAt: json.fetchedAt || Date.now(),
  };
}

function timeAgo(ts) {
  if (!ts) return null;
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function Analytics({ creator, update }) {
  const [busyAll, setBusyAll] = useState(false);
  const [allErr, setAllErr] = useState('');

  function setTarget(field, val) {
    update({ targetCpms: { ...creator.targetCpms, [field]: Number(val) || 0 } });
  }

  // One click, every platform with a handle. A YouTube response carries both
  // long-form videos and Shorts, so one call fills both cards.
  async function fetchAll() {
    setBusyAll(true);
    setAllErr('');
    const patches = {};
    const errors = [];
    for (const p of PLATFORMS) {
      if (!p.fetch) continue;
      const handle = creator.urls?.[p.urlKey];
      if (!handle) continue;
      try {
        const json = await fetchPlatformData(p, handle);
        patches[p.key] = { ...(creator.platforms?.[p.key] || {}), ...toPatch(json, creator.platforms?.[p.key] || {}, false) };
        if (p.key === 'youtube' && json.shorts?.length) {
          patches.youtubeShorts = { ...(creator.platforms?.youtubeShorts || {}), ...toPatch(json, creator.platforms?.youtubeShorts || {}, true) };
        }
      } catch (e) {
        errors.push(`${p.label}: ${e.message}`);
      }
    }
    if (Object.keys(patches).length) {
      update({ platforms: { ...creator.platforms, ...patches } });
    }
    setAllErr(errors.join(' · '));
    setBusyAll(false);
  }

  return (
    <div className="grid">
      <div className="card wide">
        <div className="card-head">
          <h2>Target CPM Rates <span className="muted">· what we're willing to pay</span></h2>
          <button className="btn small primary" onClick={fetchAll} disabled={busyAll}>
            {busyAll ? 'Fetching all…' : '↻ Fetch all platforms'}
          </button>
        </div>
        <div className="cost-grid">
          {TARGETS.map(([field, label]) => (
            <label key={field} className="cost-field">
              <span>{label}</span>
              <input
                type="number" min="0" placeholder="40"
                value={creator.targetCpms?.[field] || ''}
                onChange={(e) => setTarget(field, e.target.value)}
              />
            </label>
          ))}
        </div>
        <p className="fineprint">Blank = uses the $40 default in Deal Analysis.</p>
        <div className="card-head" style={{ marginTop: 14 }}>
          <h2>With usage rights <span className="muted">· governs "+ WL" rows</span></h2>
        </div>
        <div className="cost-grid">
          {WL_TARGETS.map(([field, label]) => (
            <label key={field} className="cost-field">
              <span>{label}</span>
              <input
                type="number" min="0" placeholder="same as base"
                value={creator.targetCpms?.[field] || ''}
                onChange={(e) => setTarget(field, e.target.value)}
              />
            </label>
          ))}
        </div>
        <p className="fineprint">Blank = falls back to the base target for that platform.</p>
        {allErr && <p className="error-text">{allErr}</p>}
      </div>

      {PLATFORMS.map((p) => (
        <PlatformCard key={p.key} p={p} creator={creator} update={update} />
      ))}
    </div>
  );
}

function PlatformCard({ p, creator, update }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const data = creator.platforms?.[p.key] || {};
  const stats = platformStats(creator, p.key);
  const viewsCsv = (data.videos || []).map((v) => v.views).filter((n) => n != null).join(', ');
  const fetchedAgo = timeAgo(data.fetchedAt);

  function patchPlatform(patch) {
    update({ platforms: { ...creator.platforms, [p.key]: { ...data, ...patch } } });
  }

  function setViews(csv) {
    const nums = csv.split(',').map((s) => Number(s.replace(/[^\d.]/g, ''))).filter((n) => !isNaN(n) && n > 0);
    patchPlatform({ videos: nums.map((views) => ({ views })) });
  }

  async function fetchLive() {
    const handle = creator.urls?.[p.urlKey];
    if (!p.fetch || !handle) { setErr('No handle set / manual only'); return; }
    setBusy(true); setErr('');
    try {
      const json = await fetchPlatformData(p, handle);
      patchPlatform(toPatch(json, data, p.key === 'youtubeShorts'));
    } catch (e) {
      setErr(e.message || 'Fetch failed (API key required on server)');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>{p.label} {fetchedAgo && <span className="muted small">· fetched {fetchedAgo}</span>}</h2>
        {p.fetch && (
          <button className="btn small" onClick={fetchLive} disabled={busy}>
            {busy ? 'Fetching…' : '↻ Fetch live'}
          </button>
        )}
      </div>

      <div className="stat-row">
        <label className="cost-field">
          <span>Followers</span>
          <input type="number" min="0" value={data.followers || ''}
            onChange={(e) => patchPlatform({ followers: Number(e.target.value) || 0 })} />
        </label>
        <label className="cost-field">
          <span>Engagement %</span>
          <input type="number" min="0" step="0.01" value={data.engagementRate || ''}
            onChange={(e) => patchPlatform({ engagementRate: Number(e.target.value) || 0 })} />
        </label>
      </div>

      <label className="cost-field block">
        <span>Recent view counts (comma-separated)</span>
        {/* key remounts the input when data changes, so a live fetch replaces
            the displayed text instead of leaving the stale defaultValue */}
        <input key={viewsCsv} type="text" placeholder="22354, 6965, 209 …" defaultValue={viewsCsv}
          onBlur={(e) => setViews(e.target.value)} />
      </label>

      <div className="metrics">
        <div className="metric primary">
          <span className="metric-label">Median</span>
          <span className="metric-value">{formatNumber(stats.median)}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Average</span>
          <span className="metric-value muted">{formatNumber(stats.average)}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Min</span>
          <span className="metric-value muted">{formatNumber(stats.min)}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Videos</span>
          <span className="metric-value muted">{stats.count}</span>
        </div>
      </div>
      {err && <p className="error-text">{err}</p>}
    </div>
  );
}
