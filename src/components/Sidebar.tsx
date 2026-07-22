// Left rail: search, creator list, add/delete.
export default function Sidebar({ creators, selectedId, onSelect, onAdd, onDelete, search, onSearch }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="brand">Creator Deals</span>
        <button className="btn small primary" onClick={onAdd}>+ New</button>
      </div>
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
