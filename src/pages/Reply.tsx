import { useState } from 'react';
import { baseTemplates, ruleBasedReply, detectIntent } from '../lib/reply.js';

export default function Reply({ creator, deal, update }) {
  const templates = baseTemplates(creator.name, deal);
  const [theirReply, setTheirReply] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState(''); // 'ai' | 'rule'
  const [image, setImage] = useState(null); // { dataUrl, mediaType, name }

  const intent = detectIntent(theirReply);
  const history = creator.conversations || [];

  function attachFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setImage({ dataUrl: reader.result, mediaType: file.type, name: file.name || 'pasted image' });
    reader.readAsDataURL(file);
  }

  // Paste a screenshot straight into the card — no save-to-disk detour.
  function onPaste(e) {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      attachFile(item.getAsFile());
    }
  }

  async function generate() {
    setBusy(true); setDraft(''); setSource('');
    let text = '';
    let src = 'rule';
    try {
      const body: any = {
        creatorName: creator.name,
        deal,
        theirReply,
        history: history.slice(-3),
      };
      if (image) {
        body.imageBase64 = image.dataUrl.split(',')[1];
        body.imageMediaType = image.mediaType;
      }
      const res = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok && json.reply) {
        text = json.reply;
        src = json.source || 'ai';
      } else {
        throw new Error(json.error || 'AI unavailable');
      }
    } catch {
      // Graceful fallback: deterministic reply, never leaves the user stuck.
      text = ruleBasedReply(creator.name, deal, theirReply);
      src = 'rule';
    } finally {
      setDraft(text);
      setSource(src);
      setBusy(false);
      // Save the exchange so follow-up drafts know what we already said.
      if (text) {
        update({
          conversations: [
            ...history,
            { at: Date.now(), theirReply, draft: text, hasImage: !!image },
          ].slice(-20),
        });
      }
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
      <div className="card wide" onPaste={onPaste}>
        <div className="card-head"><h2>Suggested Reply</h2></div>
        <label className="cost-field block">
          <span>Paste what the creator replied — text, or a screenshot of the email/DM (Cmd+V)</span>
          <textarea
            rows={4}
            placeholder="Paste their message here, or paste a screenshot of the conversation…"
            value={theirReply}
            onChange={(e) => setTheirReply(e.target.value)}
          />
        </label>

        <div className="attach-row">
          <label className="btn small attach-btn">
            📎 Attach screenshot
            <input
              type="file" accept="image/*" hidden
              onChange={(e) => { attachFile(e.target.files?.[0]); e.target.value = ''; }}
            />
          </label>
          {image && (
            <span className="attach-chip">
              <img src={image.dataUrl} alt="" className="attach-thumb" />
              {image.name}
              <button className="creator-del" title="Remove" onClick={() => setImage(null)}>×</button>
            </span>
          )}
        </div>

        {theirReply.trim() && <p className="muted small">Detected intent: <strong>{intent}</strong></p>}
        <button className="btn primary" onClick={generate} disabled={busy || (!theirReply.trim() && !image)}>
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

      {/* Saved negotiation history — feeds context into the next draft */}
      {history.length > 0 && (
        <div className="card wide">
          <div className="card-head">
            <h2>Conversation History <span className="muted">· last {Math.min(history.length, 20)} · feeds the AI context</span></h2>
            <button
              className="btn tiny"
              onClick={() => { if (confirm('Clear saved conversation history?')) update({ conversations: [] }); }}
            >
              Clear
            </button>
          </div>
          <div className="templates">
            {[...history].reverse().map((h, i) => (
              <div key={h.at || i} className="template">
                <div className="template-head">
                  <strong className="muted small">
                    {h.at ? new Date(h.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    {h.hasImage ? ' · 📎 screenshot' : ''}
                  </strong>
                  <CopyBtn text={h.draft} />
                </div>
                {h.theirReply && <p className="template-body muted">Them: {h.theirReply}</p>}
                <p className="template-body">Us: {h.draft}</p>
              </div>
            ))}
          </div>
        </div>
      )}
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
