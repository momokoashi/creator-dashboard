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

// Platforms shown as analytics cards. `fetch` = endpoint config or null (manual only).
const PLATFORMS = [
  { key: 'instagram', label: 'Instagram', urlKey: 'instagram', fetch: (h) => `/api/instagram/profile?username=${encodeURIComponent(h)}` },
  { key: 'tiktok', label: 'TikTok', urlKey: 'tiktok', fetch: (h) => `/api/tiktok/profile?username=${encodeURIComponent(h)}` },
  { key: 'youtube', label: 'YouTube', urlKey: 'youtube', fetch: (h) => `/api/youtube/channel?url=${encodeURIComponent(h)}` },
  { key: 'youtubeShorts', label: 'YT Shorts', urlKey: 'youtube', fetch: null },
  { key: 'podcast', label: 'Podcast', urlKey: 'podcast', fetch: null },
];

export default function Analytics({ creator, update }) {
  function setTarget(field, val) {
    update({ targetCpms: { ...creator.targetCpms, [field]: Number(val) || 0 } });
  }

  return (
    <div className="grid">
      <div className="card wide">
        <div className="card-head"><h2>Target CPM Rates <span className="muted">· what we're willing to pay</span></h2></div>
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
      const res = await fetch(p.fetch(handle));
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Fetch failed');
      const videos = (p.key === 'youtubeShorts' ? json.shorts : json.videos) || [];
      patchPlatform({
        followers: json.followers ?? data.followers,
        engagementRate: json.engagementRate ?? data.engagementRate,
        videos: videos.map((v) => ({ views: Number(v.views) || 0 })),
      });
    } catch (e) {
      setErr(e.message || 'Fetch failed (API key required on server)');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>{p.label}</h2>
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
        <input type="text" placeholder="22354, 6965, 209 …" defaultValue={viewsCsv}
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
