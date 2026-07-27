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
  const [bioBusy, setBioBusy] = useState(false);

  function setCost(field, val) {
    update({ costs: { ...creator.costs, [field]: Number(val) || 0 } });
  }

  // Auto-fill bio from fetched platform bios (AI-polished when the server
  // has a key; raw platform bio otherwise).
  async function autoFillBio() {
    setBioBusy(true);
    try {
      const platformBios: any = {};
      const followers: any = {};
      for (const [key, p] of Object.entries<any>(creator.platforms || {})) {
        if (p?.bio) platformBios[key] = p.bio;
        if (p?.followers) followers[key] = p.followers;
      }
      const res = await fetch('/api/bio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: creator.name, platformBios, followers, handles: creator.urls }),
      });
      const json = await res.json();
      if (json.bio) update({ bio: json.bio });
    } catch { /* leave bio as-is */ } finally {
      setBioBusy(false);
    }
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
          <button className="btn small" onClick={autoFillBio} disabled={bioBusy} title="Fill from fetched platform bios">
            {bioBusy ? 'Filling…' : '✦ Auto-fill'}
          </button>
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
        <FameCheck creator={creator} update={update} />
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
                  <td className="hi" title={p.sponsoredAdjusted ? `Organic median ${formatNumber(p.rawMedianViews)}, scaled by the ad factor` : undefined}>
                    {formatNumber(p.medianViews)}{p.sponsoredAdjusted ? '†' : ''}
                  </td>
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
        <p className="fineprint">* using default target ($40). Set per-platform targets on the Analytics tab. † views adjusted by the sponsored-post factor (their #ad posts underperform organic, so we price on what an ad will really do). Average &amp; min views are on the Analytics tab.</p>
      </div>

      <OutcomesCard creator={creator} update={update} />

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

// Fame check — automates the playbook's search-volume premium rules via
// the server's Wikipedia proxy. Result is cached on the creator record.
function FameCheck({ creator, update }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fame = creator.fame;

  async function check() {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/fame?name=${encodeURIComponent(creator.name)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Check failed');
      update({ fame: { ...json, checkedAt: Date.now() } });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fame">
      <div className="fame-row">
        {fame ? (
          <span className={'pill pill-' + (fame.tier === 'celebrity' ? 'pass' : fame.tier === 'premium' ? 'counter' : 'accept')}>
            {fame.tier === 'celebrity' ? '⭐ CELEBRITY — escalate' : fame.tier === 'premium' ? '+$5 search premium' : 'No search premium'}
          </span>
        ) : (
          <span className="muted small">Search-volume premium not checked</span>
        )}
        <button className="btn tiny" onClick={check} disabled={busy || !creator.name}>
          {busy ? 'Checking…' : fame ? '↻ Re-check' : '✦ Check fame'}
        </button>
      </div>
      {fame?.note && <p className="fineprint">{fame.note}{fame.url ? <> · <a className="fame-link" href={fame.url} target="_blank" rel="noreferrer">Wikipedia ↗</a></> : null}</p>}
      {err && <p className="error-text">{err}</p>}
    </div>
  );
}

// Deal outcomes — what actually happened after we paid. Realized CPM and
// ROAS per deal close the loop on the predictions above (playbook rule:
// keep the relationship when videos clear 1.8 ROAS).
function OutcomesCard({ creator, update }) {
  const [form, setForm] = useState({ label: '', paid: '', views: '', revenue: '' });
  const outcomes = creator.outcomes || [];

  function addOutcome() {
    const paid = Number(form.paid) || 0;
    if (!form.label.trim() || paid <= 0) return;
    update({
      outcomes: [
        ...outcomes,
        {
          at: Date.now(),
          label: form.label.trim(),
          paid,
          views: Number(form.views) || 0,
          revenue: Number(form.revenue) || 0,
        },
      ],
    });
    setForm({ label: '', paid: '', views: '', revenue: '' });
  }

  function removeOutcome(at) {
    update({ outcomes: outcomes.filter((o) => o.at !== at) });
  }

  const totals = outcomes.reduce(
    (t, o) => ({ paid: t.paid + o.paid, views: t.views + o.views, revenue: t.revenue + o.revenue }),
    { paid: 0, views: 0, revenue: 0 }
  );
  const realizedCpm = totals.views > 0 ? (totals.paid / totals.views) * 1000 : null;
  const realizedRoas = totals.paid > 0 && totals.revenue > 0 ? totals.revenue / totals.paid : null;

  return (
    <div className="card wide">
      <div className="card-head">
        <h2>Deal Outcomes <span className="muted">· what actually happened · keep at 1.8+ ROAS</span></h2>
        {outcomes.length > 0 && (
          <span className="muted small">
            Realized CPM {formatCpm(realizedCpm)}
            {realizedRoas != null && (
              <> · ROAS <strong className={realizedRoas >= 1.8 ? 'views-hi' : 'views-lo'}>{realizedRoas.toFixed(2)}</strong></>
            )}
          </span>
        )}
      </div>

      {outcomes.length > 0 && (
        <table className="deal-table">
          <thead>
            <tr><th>Date</th><th>Deal</th><th>Paid</th><th>Actual views</th><th>Realized CPM</th><th>Revenue</th><th>ROAS</th><th></th></tr>
          </thead>
          <tbody>
            {outcomes.map((o) => {
              const rCpm = o.views > 0 ? (o.paid / o.views) * 1000 : null;
              const roas = o.paid > 0 && o.revenue > 0 ? o.revenue / o.paid : null;
              return (
                <tr key={o.at}>
                  <td className="muted">{new Date(o.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</td>
                  <td>{o.label}</td>
                  <td>{formatMoney(o.paid)}</td>
                  <td>{o.views ? formatNumber(o.views) : '—'}</td>
                  <td>{formatCpm(rCpm)}</td>
                  <td>{o.revenue ? formatMoney(o.revenue) : '—'}</td>
                  <td>
                    {roas == null ? '—' : (
                      <span className={'pill ' + (roas >= 1.8 ? 'pill-accept' : 'pill-pass')}>{roas.toFixed(2)}</span>
                    )}
                  </td>
                  <td><button className="creator-del" title="Remove" onClick={() => removeOutcome(o.at)}>×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="outcome-form">
        <input placeholder="Deal (e.g. 1x Reel, June)" value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })} />
        <input type="number" min="0" placeholder="Paid $" value={form.paid}
          onChange={(e) => setForm({ ...form, paid: e.target.value })} />
        <input type="number" min="0" placeholder="Actual views" value={form.views}
          onChange={(e) => setForm({ ...form, views: e.target.value })} />
        <input type="number" min="0" placeholder="Revenue $ (optional)" value={form.revenue}
          onChange={(e) => setForm({ ...form, revenue: e.target.value })} />
        <button className="btn small primary" onClick={addOutcome} disabled={!form.label.trim() || !(Number(form.paid) > 0)}>
          + Log deal
        </button>
      </div>
      <p className="fineprint">Log each finished deal: what you paid, the views the post actually got, and tracked revenue (code redemptions / affiliate). Over time this shows the creator's realized CPM vs the predictions above.</p>
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
