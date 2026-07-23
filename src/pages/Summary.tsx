import { useState } from 'react';
import DecisionBadge from '../components/DecisionBadge';
import { formatMoney, formatCpm, formatNumber } from '../lib/format.js';

const PLATFORM_COSTS = [
  ['costIgReel', 'IG Reel (1x)'],
  ['costIgReels', 'IG Reels (pkg)'],
  ['costTiktok', 'TikTok'],
  ['costYoutube', 'YouTube'],
  ['costYtShorts', 'YT Shorts'],
  ['costPodcast', 'Podcast'],
  ['costBundleIgTt', 'Bundle (IG+TT)'],
  ['costBundleAll', 'Full Bundle'],
];

const WHITELIST_COSTS = [
  ['wlIg', 'IG'],
  ['wlIgReels', 'IG Reels'],
  ['wlTiktok', 'TikTok'],
  ['wlYoutube', 'YouTube'],
  ['wlYtShorts', 'YT Shorts'],
  ['wlBundle', 'Bundle'],
];

const CHANNELS = [
  ['instagram', 'Instagram'],
  ['tiktok', 'TikTok'],
  ['youtube', 'YouTube'],
  ['podcast', 'Podcast'],
];

export default function Summary({ creator, deal, update }) {
  // Nudge to force a visual "recalculated" pulse; the numbers are already reactive.
  const [pulse, setPulse] = useState(0);

  function setCost(field, val) {
    update({ costs: { ...creator.costs, [field]: Number(val) || 0 } });
  }

  function setUrl(key, val) {
    update({ urls: { ...creator.urls, [key]: val } });
  }

  const overall = deal?.overall;
  const overridden = !!creator.override;
  const shownDecision = overridden ? creator.override.decision : overall?.decision || 'UNKNOWN';
  const shownReason = overridden
    ? `Manual override — ${creator.override.note || 'brand-fit decision'}`
    : overall?.reason || 'Add costs and view data to compute a decision.';

  return (
    <div className="grid" key={pulse}>
      {/* ---- Bio + channel links ---- */}
      <div className="card">
        <div className="card-head">
          <h2>Bio</h2>
        </div>
        <label className="cost-field block">
          <span>Creator name</span>
          <input
            type="text" placeholder="Creator name"
            value={creator.name || ''}
            onChange={(e) => update({ name: e.target.value })}
          />
        </label>
        <textarea
          className="bio"
          placeholder="Short bio — who they are and why they're famous…"
          value={creator.bio || ''}
          onChange={(e) => update({ bio: e.target.value })}
          rows={3}
        />
        <div className="handle-grid">
          {CHANNELS.map(([key, label]) => (
            <label key={key} className="cost-field">
              <span>{label} handle</span>
              <input
                type="text" placeholder="@handle or URL"
                value={creator.urls?.[key] || ''}
                onChange={(e) => setUrl(key, e.target.value)}
              />
            </label>
          ))}
        </div>
        <div className="channels">
          {CHANNELS.map(([key, label]) => {
            const url = creator.urls?.[key];
            return url ? (
              <a key={key} className="channel-link" href={normalizeUrl(key, url)} target="_blank" rel="noreferrer">
                {label} ↗
              </a>
            ) : (
              <span key={key} className="channel-link disabled">{label}</span>
            );
          })}
        </div>
      </div>

      {/* ---- Decision (the headline) ---- */}
      <div className="card decision-card">
        <div className="card-head">
          <h2>Decision</h2>
          <button className="btn small" onClick={() => setPulse((p) => p + 1)}>↻ Refresh CPM</button>
        </div>
        <DecisionBadge decision={shownDecision} reason={shownReason} overridden={overridden} />
        <OverrideControl creator={creator} update={update} />
      </div>

      {/* ---- Deal analysis: median first ---- */}
      <div className="card wide">
        <div className="card-head"><h2>Deal Analysis <span className="muted">· median is what we optimise</span></h2></div>
        {deal?.packages?.length ? (
          <table className="deal-table">
            <thead>
              <tr>
                <th>Package</th><th>Cost</th>
                <th className="hi">Median views</th><th className="hi">CPM (median)</th>
                <th>Target</th><th>Counter</th><th>Call</th>
              </tr>
            </thead>
            <tbody>
              {deal.packages.map((p) => (
                <tr key={p.key} className={'row-' + p.decision.toLowerCase()}>
                  <td>{p.label}</td>
                  <td>{formatMoney(p.cost)}</td>
                  <td className="hi">{formatNumber(p.medianViews)}</td>
                  <td className="hi">{formatCpm(p.actualCpm)}</td>
                  <td>{formatCpm(p.target)}{p.usingDefaultTarget ? '*' : ''}</td>
                  <td>{formatMoney(p.counterPrice)}</td>
                  <td><span className={'pill pill-' + p.decision.toLowerCase()}>{p.decision}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Enter platform costs below and view data on the Analytics tab to see CPMs.</p>
        )}
        <p className="fineprint">* using default target ($40). Set per-platform targets on the Analytics tab. Average &amp; min views are shown there as secondary metrics.</p>
      </div>

      {/* ---- Platform costs ---- */}
      <div className="card">
        <div className="card-head"><h2>Platform Costs</h2></div>
        <div className="cost-grid">
          {PLATFORM_COSTS.map(([field, label]) => (
            <label key={field} className="cost-field">
              <span>{label}</span>
              <input
                type="number" min="0" placeholder="0"
                value={creator.costs?.[field] || ''}
                onChange={(e) => setCost(field, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>

      {/* ---- Whitelisting costs ---- */}
      <div className="card">
        <div className="card-head"><h2>Whitelisting Costs <span className="muted">· additional</span></h2></div>
        <div className="cost-grid">
          {WHITELIST_COSTS.map(([field, label]) => (
            <label key={field} className="cost-field">
              <span>{label}</span>
              <input
                type="number" min="0" placeholder="0"
                value={creator.costs?.[field] || ''}
                onChange={(e) => setCost(field, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// Brand-fit override: force ACCEPT/COUNTER/PASS with a note when raw CPM
// doesn't capture an authority creator's real value.
function OverrideControl({ creator, update }) {
  const o = creator.override;
  return (
    <div className="override">
      {o ? (
        <div className="override-active">
          <span>Overridden to <strong>{o.decision}</strong></span>
          <button className="btn tiny" onClick={() => update({ override: null })}>Clear</button>
        </div>
      ) : (
        <details>
          <summary className="muted small">Override decision (brand fit)</summary>
          <div className="override-form">
            {['ACCEPT', 'COUNTER', 'PASS'].map((d) => (
              <button
                key={d}
                className="btn tiny"
                onClick={() => update({ override: { decision: d, note: '' } })}
              >
                Force {d}
              </button>
            ))}
          </div>
        </details>
      )}
      {o && (
        <input
          className="override-note"
          placeholder="Why? (e.g. category authority, high conversion)"
          value={o.note || ''}
          onChange={(e) => update({ override: { ...o, note: e.target.value } })}
        />
      )}
    </div>
  );
}

const HANDLE_URLS = {
  instagram: (h) => 'https://instagram.com/' + h,
  tiktok: (h) => 'https://www.tiktok.com/@' + h,
  youtube: (h) => 'https://www.youtube.com/@' + h,
};

function normalizeUrl(key, u) {
  if (!u) return '#';
  if (u.startsWith('http')) return u;
  const handle = u.startsWith('@') ? u.slice(1) : u;
  if (u.includes('.') && !u.startsWith('@')) return 'https://' + u;
  const toUrl = HANDLE_URLS[key];
  return toUrl ? toUrl(handle) : 'https://' + u;
}
