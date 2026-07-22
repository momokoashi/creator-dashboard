import { useEffect, useMemo, useState } from 'react';
import { loadCreators, saveCreators, newCreatorId } from './lib/store.js';
import { evaluateDeal } from './lib/decision.js';
import Sidebar from './components/Sidebar';
import Summary from './pages/Summary';
import Analytics from './pages/Analytics';
import Reply from './pages/Reply';

const TABS = [
  { key: 'summary', label: 'Summary' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'reply', label: 'Reply' },
];

export default function App() {
  const [creators, setCreators] = useState(() => loadCreators());
  const [selectedId, setSelectedId] = useState(() => creators[0]?.id ?? null);
  const [tab, setTab] = useState('summary');
  const [search, setSearch] = useState('');

  // Persist whenever creators change — single source of truth.
  useEffect(() => { saveCreators(creators); }, [creators]);

  const selected = creators.find((c) => c.id === selectedId) || null;

  // Deal recomputes automatically on any data change (fixes the v1 "not updating" bug).
  const deal = useMemo(() => (selected ? evaluateDeal(selected) : null), [selected]);

  /** Merge a patch into the selected creator immutably. */
  function updateCreator(patch) {
    if (!selectedId) return;
    setCreators((list) =>
      list.map((c) => (c.id === selectedId ? { ...c, ...patch } : c))
    );
  }

  function addCreator() {
    const c = {
      id: newCreatorId(),
      name: 'New Creator',
      bio: '', urls: {}, platforms: {}, costs: {}, targetCpms: {},
      override: null, conversations: [],
    };
    setCreators((list) => [...list, c]);
    setSelectedId(c.id);
    setTab('summary');
  }

  function deleteCreator(id) {
    setCreators((list) => {
      const next = list.filter((c) => c.id !== id);
      if (id === selectedId) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? creators.filter((c) => c.name.toLowerCase().includes(q)) : creators;
  }, [creators, search]);

  return (
    <div className="app">
      <Sidebar
        creators={filtered}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onAdd={addCreator}
        onDelete={deleteCreator}
        search={search}
        onSearch={setSearch}
      />

      <main className="main">
        {!selected ? (
          <div className="empty">
            <h1>Creator Deal Dashboard</h1>
            <p>Add a creator to start analysing a deal.</p>
            <button className="btn primary" onClick={addCreator}>+ Add creator</button>
          </div>
        ) : (
          <>
            <header className="topbar">
              <h1>{selected.name}</h1>
              <nav className="tabs">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    className={'tab' + (tab === t.key ? ' active' : '')}
                    onClick={() => setTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            </header>

            <section className="page">
              {tab === 'summary' && (
                <Summary creator={selected} deal={deal} update={updateCreator} />
              )}
              {tab === 'analytics' && (
                <Analytics creator={selected} deal={deal} update={updateCreator} />
              )}
              {tab === 'reply' && (
                <Reply creator={selected} deal={deal} update={updateCreator} />
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
