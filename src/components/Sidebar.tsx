import { useState } from 'react';

// Left rail: quick-add (paste a handle), search, creator list, add/delete.
export default function Sidebar({ creators, selectedId, onSelect, onAdd, onQuickAdd, onDelete, search, onSearch }) {
  const [quick, setQuick] = useState('');

  function submitQuick() {
    const v = quick.trim();
    if (!v) return;
    onQuickAdd(v);
    setQuick('');
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="brand">Creator Deals</span>
        <button className="btn small" onClick={onAdd} title="Add a blank creator">+ Blank</button>
      </div>
      <div className="quick-add">
        <input
          className="search"
          placeholder="Paste @handle or profile URL…"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitQuick(); }}
        />
        <button className="btn small primary" onClick={submitQuick} disabled={!quick.trim()}>
          + Add
        </button>
      </div>
      <p className="fineprint">Auto-fetches name, bio &amp; last 10 videos. IG/TikTok/YouTube links or bare @handle (assumes IG).</p>
      <input
        className="search"
        placeholder="Search creators…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      <ul className="creator-list">
        {creators.length === 0 && <li className="muted pad">No creators yet.</li>}
        {creators.map((c) => (
          <li
            key={c.id}
            className={'creator-item' + (c.id === selectedId ? ' active' : '')}
            onClick={() => onSelect(c.id)}
          >
            <span className="creator-name">{c.name}</span>
            <button
              className="creator-del"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete "${c.name}"?`)) onDelete(c.id);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
