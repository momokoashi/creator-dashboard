import { useState } from 'react';
import { platformStats, isSponsored } from '../lib/cpm.js';
import { formatNumber } from '../lib/format.js';
import { videosToStore, carryManualTags } from '../lib/quickadd.js';

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
    bio: json.bio || existing.bio || '',
    // Full objects (title/date/likes), not just view counts, so the UI can
    // list the last 10 videos instead of a bare count. Manual sponsored
    // tags survive the re-fetch via carryManualTags.
    videos: carryManualTags(videosToStore(videos), existing.videos),
    viewsAreLikes: !!json.viewsAreLikes,
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

export default function Analytics({ creator, deal, update }: any) {
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
    const patches: any = {};
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
      const patch: any = { platforms: { ...creator.platforms, ...patches } };
      // Auto-fill the bio from the first platform that has one (never
      // overwrite something already written by hand).
      if (!creator.bio) {
        const fetchedBio = Object.values(patches).map((p: any) => p.bio).find(Boolean);
        if (fetchedBio) patch.bio = fetchedBio;
      }
      update(patch);
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

  // Cycle a video's sponsored tag: auto-detect -> AD -> organic -> auto.
  function tagVideo(idx) {
    const vids = [...(data.videos || [])];
    const v = vids[idx];
    if (!v) return;
    const next = v.sponsored == null ? true : v.sponsored === true ? false : null;
    const nv: any = { ...v };
    if (next == null) delete nv.sponsored; else nv.sponsored = next;
    vids[idx] = nv;
    patchPlatform({ videos: vids });
  }

  async function fetchLive() {
    const handle = creator.urls?.[p.urlKey];
    if (!p.fetch || !handle) { setErr('No handle set / manual only'); return; }
    setBusy(true); setErr('');
    try {
      const json = await fetchPlatformData(p, handle);
      const platformPatch = toPatch(json, data, p.key === 'youtubeShorts');
      const patch: any = { platforms: { ...creator.platforms, [p.key]: { ...data, ...platformPatch } } };
      if (!creator.bio && platformPatch.bio) patch.bio = platformPatch.bio;
      update(patch);
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

      <div className="metrics">
        <div className="metric" title="Median views ÷ followers. Under ~5% suggests a dead or bought following; well over 100% means they outperform their size.">
          <span className="metric-label">Reach rate</span>
          <span className={'metric-value ' + (stats.reachRate == null ? 'muted' : stats.reachRate < 5 ? 'views-lo' : 'views-hi')}>
            {stats.reachRate == null ? '—' : stats.reachRate.toFixed(0) + '%'}
          </span>
        </div>
        <div className="metric" title="Median of the newest videos vs the ones before them. Falling = you're buying yesterday's reach.">
          <span className="metric-label">Trend</span>
          <span className={'metric-value ' + (stats.trendPct == null ? 'muted' : stats.trendPct < -10 ? 'views-lo' : stats.trendPct > 10 ? 'views-hi' : '')}>
            {stats.trendPct == null ? '—' : (stats.trendPct > 0 ? '↗ +' : stats.trendPct < 0 ? '↘ ' : '→ ') + stats.trendPct.toFixed(0) + '%'}
          </span>
        </div>
        <div className="metric" title="Where 8 of the 10 videos land (best and worst dropped). A wide range = volatile — write a minimum-view floor into the deal.">
          <span className="metric-label">Typical range</span>
          <span className="metric-value muted small-value">
            {stats.count >= 5 ? `${formatNumber(stats.typicalLow)}–${formatNumber(stats.typicalHigh)}` : '—'}
          </span>
        </div>
        <div className="metric" title="Median views of their #ad posts ÷ organic median. Below 1× = sponsored posts underperform; the Deal Analysis prices on the sponsored median.">
          <span className="metric-label">Ad factor{stats.sponsoredFactor != null ? ` (n=${stats.sponsoredCount})` : ''}</span>
          <span className={'metric-value ' + (stats.sponsoredFactor == null ? 'muted' : stats.sponsoredFactor < 0.85 ? 'views-lo' : 'views-hi')}>
            {stats.sponsoredFactor == null ? '—' : stats.sponsoredFactor.toFixed(2) + '×'}
          </span>
        </div>
      </div>

      {stats.freshSkipped > 0 && (
        <p className="fineprint">
          Excluded {stats.freshSkipped} post{stats.freshSkipped > 1 ? 's' : ''} under 24h old (views still accruing).
        </p>
      )}
      {stats.sponsoredFactor != null && (
        <p className="fineprint">
          Sponsored posts ({stats.sponsoredCount}): median {formatNumber(stats.sponsoredMedian)} vs organic {formatNumber(stats.organicMedian)} — deal CPMs price paid posts at the sponsored median.
          {stats.sponsoredLowConfidence ? ' Low confidence with under 3 tagged ads — tag more if you can.' : ''}
        </p>
      )}

      {data.viewsAreLikes && (
        <p className="error-text">
          ⚠ No Reels found for this account — the numbers above are like-counts, not views.
          The real median views are likely much higher; verify on the profile before pricing a deal.
        </p>
      )}

      <VideoList videos={data.videos} median={stats.median} onTag={tagVideo} />

      <details className="manual-views">
        <summary className="muted small">Manual entry (comma-separated views)</summary>
        <label className="cost-field block">
          {/* key remounts the input when data changes, so a live fetch replaces
              the displayed text instead of leaving the stale defaultValue */}
          <input key={viewsCsv} type="text" placeholder="22354, 6965, 209 …" defaultValue={viewsCsv}
            onBlur={(e) => setViews(e.target.value)} />
        </label>
      </details>
      {err && <p className="error-text">{err}</p>}
    </div>
  );
}

// Last-10 list — the per-video detail that a bare count hides. Views above
// the median glow green, below glow red, so fluctuation is visible at a glance.
// The Ad column is click-to-cycle (auto-detect -> AD -> organic -> auto) so
// undisclosed or label-only sponsored posts can be tagged by hand — manual
// tags feed the ad factor and survive re-fetches.
function VideoList({ videos, median, onTag }) {
  const rows = (videos || [])
    .map((v, idx) => ({ v, idx }))
    .filter(({ v }) => v.title || v.publishedAt);
  if (!rows.length) return null;
  return (
    <>
      <table className="video-list">
        <thead>
          <tr><th>#</th><th>Video</th><th>Date</th><th>Ad</th><th className="num">Views</th></tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map(({ v, idx }, i) => {
            const sponsored = isSponsored(v);
            const manual = v.sponsored != null;
            return (
              <tr key={idx}>
                <td className="muted">{i + 1}</td>
                <td className="video-title" title={v.title}>{v.title || '—'}</td>
                <td className="muted">{v.publishedAt ? new Date(v.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—'}</td>
                <td>
                  <button
                    className={'tag-btn' + (sponsored ? ' tag-ad' : ' tag-org') + (manual ? ' tag-manual' : '')}
                    title={
                      (sponsored ? 'Sponsored' : 'Organic') + (manual ? ' (tagged by hand)' : ' (auto-detected from caption)') +
                      ' — click to change: auto → AD → organic → auto'
                    }
                    onClick={() => onTag && onTag(idx)}
                  >
                    {sponsored ? 'AD' : 'org'}{manual ? ' ✓' : ''}
                  </button>
                </td>
                <td className={'num ' + (median && v.views >= median ? 'views-hi' : 'views-lo')}>{formatNumber(v.views)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="fineprint">Click the Ad column to tag posts the caption scan missed (e.g. "Paid partnership" label-only). Tags refine the ad factor and stick across re-fetches.</p>
    </>
  );
}
