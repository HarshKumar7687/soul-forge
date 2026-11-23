import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { charactersApi } from "../api/characters";
import { ApiError } from "../api/client";
import { Alert } from "../components/Alert";
import { CardSkeleton, CharacterCard } from "../components/CharacterCard";
import { useStartChat } from "../hooks/useStartChat";
import type { Character } from "../types";

export function Characters() {
  const [items, setItems] = useState<Character[] | null>(null);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const chat = useStartChat();

  const load = () =>
    charactersApi.list()
      .then((r) => setItems(r.characters))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your characters"));
  useEffect(() => { load(); }, []);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id); setError("");
    try { await fn(); await load(); setConfirmId(null); }
    catch (e) { setError(e instanceof ApiError ? e.message : "That did not work. Try again."); }
    finally { setBusyId(null); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Character library</h1>
          <p className="mt-1 text-mute">Everything you have created.</p>
        </div>
        <Link to="/characters/new" className="btn-primary">New character</Link>
      </div>
      {(error || chat.error) && <div className="mt-6"><Alert>{error || chat.error}</Alert></div>}

      <div className="mt-8">
        {items === null && !error && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <CardSkeleton key={i} />)}</div>
        )}
        {items?.length === 0 && (
          <div className="surface px-6 py-14 text-center">
            <h2 className="text-xl font-bold">No characters yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-mute">Describe someone, give them a voice, and they will show up here.</p>
            <Link to="/characters/new" className="btn-primary mt-6">Create your first character</Link>
          </div>
        )}
        {items && items.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((c) => (
              <CharacterCard key={c.id} c={c} showStatus>
                {confirmId === c.id ? (
                  <>
                    <span className="w-full text-sm text-mute">Delete “{c.name}” permanently?</span>
                    <button className="btn-danger !py-1.5" disabled={busyId === c.id} onClick={() => act(c.id, () => charactersApi.remove(c.id))}>
                      {busyId === c.id ? "Deleting…" : "Delete"}
                    </button>
                    <button className="btn-ghost !py-1.5" onClick={() => setConfirmId(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="btn-primary !py-1.5" disabled={chat.busyId === c.id} onClick={() => chat.start(c.id)}>{chat.busyId === c.id ? "Opening…" : "Chat"}</button>
                    <Link to={`/characters/${c.id}/edit`} className="btn-ghost !py-1.5">Edit</Link>
                    <button className="btn-ghost !py-1.5" disabled={busyId === c.id} onClick={() => act(c.id, () => charactersApi.duplicate(c.id))}>Duplicate</button>
                    <button className="btn-danger !py-1.5" onClick={() => setConfirmId(c.id)}>Delete</button>
                  </>
                )}
              </CharacterCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
