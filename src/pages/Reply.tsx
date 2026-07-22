import { useState } from 'react';
import { baseTemplates, ruleBasedReply, detectIntent } from '../lib/reply.js';

export default function Reply({ creator, deal }) {
  const templates = baseTemplates(creator.name, deal);
  const [theirReply, setTheirReply] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState(''); // 'ai' | 'rule'

  const intent = detectIntent(theirReply);

  async function generate() {
    setBusy(true); setDraft(''); setSource('');
    try {
      const res = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorName: creator.name, deal, theirReply }),
      });
      const json = await res.json();
      if (res.ok && json.reply) {
        setDraft(json.reply);
        setSource(json.source || 'ai');
      } else {
        throw new Error(json.error || 'AI unavailable');
      }
    } catch {
      // Graceful fallback: deterministic reply, never leaves the user stuck.
      setDraft(ruleBasedReply(creator.name, deal, theirReply));
      setSource('rule');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid">
      {/* Opening templates by decision */}
      <div className="card wide">
        <div className="card-head">
          <h2>Opening Templates</h2>
          <span className={'pill pill-' + (deal?.overall?.decision?.toLowerCase() || 'unknown')}>
            {deal?.overall?.decision || 'NEED DATA'}
          </span>
        </div>
        <p className="muted small">Pre-filled from the current decision. Click to copy.</p>
        <div className="templates">
          {templates.map((t) => (
            <div key={t.id} className="template">
              <div className="template-head">
                <strong>{t.label}</strong>
                <CopyBtn text={t.body} />
              </div>
              <p className="template-body">{t.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Their reply -> suggested response */}
      <div className="card wide">
        <div className="card-head"><h2>Suggested Reply</h2></div>
        <label className="cost-field block">
          <span>Paste what the creator replied</span>
          <textarea
            rows={4}
            placeholder="e.g. Thanks! Our rate is firm at $5,000 for the reel."
            value={theirReply}
            onChange={(e) => setTheirReply(e.target.value)}
          />
        </label>
        {theirReply.trim() && <p className="muted small">Detected intent: <strong>{intent}</strong></p>}
        <button className="btn primary" onClick={generate} disabled={busy}>
          {busy ? 'Drafting…' : '✦ Generate reply'}
        </button>

        {draft && (
          <div className="draft">
            <div className="template-head">
              <strong>Suggested reply {source === 'rule' && <span className="muted small">(offline fallback)</span>}</strong>
              <CopyBtn text={draft} />
            </div>
            <textarea className="draft-body" rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} />
          </div>
        )}
      </div>
    </div>
  );
}

function CopyBtn({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn tiny"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); } catch {}
      }}
    >
      {done ? 'Copied ✓' : 'Copy'}
    </button>
  );
}
