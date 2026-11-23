import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { charactersApi } from "../api/characters";
import { ApiError } from "../api/client";
import { Alert } from "../components/Alert";
import { CardSkeleton, CharacterCard } from "../components/CharacterCard";
import { FavoriteButton } from "../components/FavoriteButton";
import { useStartChat } from "../hooks/useStartChat";
import { CATEGORIES, type PublicCharacter } from "../types";

export function Explore() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(q);
  const category = params.get("category") ?? "";
  const trait = params.get("trait") ?? "";
  const sort = params.get("sort") ?? "popular";
  const [traits, setTraits] = useState<{ trait: string; count: number }[]>([]);
  const [items, setItems] = useState<PublicCharacter[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const chat = useStartChat();
  const reqId = useRef(0);

  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { charactersApi.traits().then((r) => setTraits(r.traits)).catch(() => {}); }, []);

  const load = useCallback(async (p: number, replace: boolean) => {
    const id = ++reqId.current;
    setLoading(true); setError("");
    try {
      const r = await charactersApi.browse({ q: debounced, category, trait, sort, page: p });
      if (id !== reqId.current) return; // a newer search replaced this one
      setItems((cur) => (replace ? r.characters : [...cur, ...r.characters]));
      setHasMore(r.hasMore); setTotal(r.total); setPage(p);
    } catch (e) {
      if (id === reqId.current) setError(e instanceof ApiError ? e.message : "Could not load characters");
    } finally { if (id === reqId.current) setLoading(false); }
  }, [debounced, category, trait, sort]);
  useEffect(() => { load(1, true); }, [load]);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const filtersActive = !!(debounced || category || trait);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-4xl font-bold">Explore characters</h1>
      <p className="mt-2 text-mute">Public characters made by the community.</p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
        <div>
          <label htmlFor="q" className="sr-only">Search characters</label>
          <input id="q" type="search" className="input" placeholder="Search by name or description" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} />
        </div>
        <div>
          <label htmlFor="cat" className="sr-only">Category</label>
          <select id="cat" className="input" value={category} onChange={(e) => setParam("category", e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("-", " ")}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="trait" className="sr-only">Personality</label>
          <select id="trait" className="input" value={trait} onChange={(e) => setParam("trait", e.target.value)}>
            <option value="">Any personality</option>
            {traits.map((t) => <option key={t.trait} value={t.trait}>{t.trait} ({t.count})</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sort" className="sr-only">Sort</label>
          <select id="sort" className="input" value={sort} onChange={(e) => setParam("sort", e.target.value === "popular" ? "" : e.target.value)}>
            <option value="popular">Most popular</option>
            <option value="recent">Newest</option>
          </select>
        </div>
      </div>

      {error && <div className="mt-6"><Alert>{error}</Alert></div>}
      {chat.error && <div className="mt-6"><Alert>{chat.error}</Alert></div>}

      <p className="mt-6 text-sm text-mute" aria-live="polite">{!loading || items.length ? `${total} character${total === 1 ? "" : "s"}` : ""}</p>
      <div className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <CharacterCard key={c.id} c={c} href={`/c/${c.id}`} creator={c.creator?.displayName} showGreeting>
            <button className="btn-primary !py-1.5" disabled={chat.busyId === c.id} onClick={() => chat.start(c.id)}>{chat.busyId === c.id ? "Opening…" : "Chat"}</button>
            <FavoriteButton id={c.id} initial={!!c.isFavorite} />
          </CharacterCard>
        ))}
        {loading && [0, 1, 2].map((i) => <CardSkeleton key={`s${i}`} />)}
      </div>

      {!loading && !error && items.length === 0 && (
        <div className="surface mt-4 px-6 py-14 text-center">
          <h2 className="text-xl font-bold">{filtersActive ? "No characters match" : "No public characters yet"}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-mute">{filtersActive ? "Try a different search or clear the filters." : "Be the first: publish a character and make it public."}</p>
          {filtersActive
            ? <button className="btn-ghost mt-6" onClick={() => { setQ(""); setParams({}, { replace: true }); }}>Clear filters</button>
            : <Link to="/characters/new" className="btn-primary mt-6">Create a character</Link>}
        </div>
      )}
      {hasMore && !loading && (
        <div className="mt-8 text-center"><button className="btn-ghost" onClick={() => load(page + 1, false)}>Load more</button></div>
      )}
    </div>
  );
}
