import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { memoriesApi } from "../api/library";
import { Alert } from "../components/Alert";
import { Portrait } from "../components/Portrait";
import { Spinner } from "../components/Spinner";
import { MEMORY_TYPES, type Memory } from "../types";

type Chars = { id: string; name: string; portraitUrl: string }[];

export function Memories() {
  const [params, setParams] = useSearchParams();
  const filter = params.get("character") ?? "";
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [chars, setChars] = useState<Chars>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ content: "", type: "fact" });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [adding, setAdding] = useState({ content: "", type: "fact" });

  const load = () => memoriesApi.list(filter || undefined)
    .then((r) => { setMemories(r.memories); setChars((prev) => { const m = new Map(prev.map((c) => [c.id, c])); r.characters.forEach((c) => m.set(c.id, c)); return [...m.values()]; }); })
    .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load memories"));
  useEffect(() => { setMemories(null); load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try { await fn(); await load(); } catch (e) { setError(e instanceof ApiError ? e.message : "That did not work. Try again."); }
  };
  const groups = useMemo(() => {
    const by = new Map<string, Memory[]>();
    (memories ?? []).forEach((m) => by.set(m.characterId, [...(by.get(m.characterId) ?? []), m]));
    return [...by.entries()];
  }, [memories]);
  const name = (id: string) => chars.find((c) => c.id === id)?.name ?? "Unknown character";

  const add = async (e: FormEvent) => {
    e.preventDefault();
    await act(async () => { await memoriesApi.create({ characterId: filter, ...adding }); setAdding({ content: "", type: "fact" }); });
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold">Memories</h1>
      <p className="mt-1 text-mute">What your characters remember about you. Only lasting details are kept, never every message. Edit or delete anything you like.</p>
      {filter && (
        <p className="mt-3 text-sm text-mute">Showing one character. <button className="text-glass hover:underline" onClick={() => setParams({})}>Show all</button></p>
      )}
      {error && <div className="mt-6"><Alert>{error}</Alert></div>}

      {filter && (
        <form onSubmit={add} className="surface mt-6 space-y-3 p-4">
          <label htmlFor="newmem" className="text-sm font-medium">Add a memory for {name(filter)}</label>
          <div className="flex flex-wrap gap-2">
            <input id="newmem" className="input min-w-[12rem] flex-1" value={adding.content} maxLength={400} placeholder="For example: Sam loves sailing at dawn"
              onChange={(e) => setAdding({ ...adding, content: e.target.value })} />
            <select aria-label="Type" className="input !w-auto" value={adding.type} onChange={(e) => setAdding({ ...adding, type: e.target.value })}>
              {MEMORY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="btn-primary" disabled={adding.content.trim().length < 3}>Add</button>
          </div>
        </form>
      )}

      <div className="mt-8 space-y-8">
        {memories === null && !error && <Spinner label="Loading memories" />}
        {memories?.length === 0 && (
          <div className="surface px-6 py-14 text-center">
            <h2 className="text-xl font-bold">Nothing remembered yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-mute">As you chat, characters note lasting facts and events. Memories will appear here.</p>
            <Link to="/chats" className="btn-primary mt-6">Go to chats</Link>
          </div>
        )}
        {groups.map(([cid, list]) => (
          <section key={cid}>
            <div className="mb-3 flex items-center gap-3">
              <Portrait url={chars.find((c) => c.id === cid)?.portraitUrl} name={name(cid)} className="h-9 w-9 rounded-full text-sm" />
              <h2 className="text-lg font-bold">{name(cid)}</h2>
              {!filter && <button className="text-xs text-glass hover:underline" onClick={() => setParams({ character: cid })}>Add or filter</button>}
            </div>
            <ul className="space-y-2">
              {list.map((m) => (
                <li key={m.id} className="surface p-4">
                  {editing === m.id ? (
                    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(async () => { await memoriesApi.update(m.id, draft); setEditing(null); }); }}>
                      <label className="sr-only" htmlFor={`e${m.id}`}>Memory</label>
                      <textarea id={`e${m.id}`} className="input min-h-[72px]" maxLength={400} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
                      <div className="flex flex-wrap gap-2">
                        <select aria-label="Type" className="input !w-auto" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                          {MEMORY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <button className="btn-primary !py-1.5" disabled={draft.content.trim().length < 3}>Save</button>
                        <button type="button" className="btn-ghost !py-1.5" onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p>{m.content}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mute">
                        <span className="rounded bg-raised px-2 py-0.5">{m.type}</span>
                        <span>{m.source === "auto" ? "Learned in chat" : "Added by you"}</span>
                        <span className="flex-1" />
                        {confirmId === m.id ? (
                          <>
                            <span>Delete this memory?</span>
                            <button className="btn-danger !px-3 !py-1" onClick={() => { setConfirmId(null); act(() => memoriesApi.remove(m.id)); }}>Delete</button>
                            <button className="btn-ghost !px-3 !py-1" onClick={() => setConfirmId(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="btn-ghost !px-3 !py-1" onClick={() => { setEditing(m.id); setDraft({ content: m.content, type: m.type }); }}>Edit</button>
                            <button className="btn-danger !px-3 !py-1" onClick={() => setConfirmId(m.id)}>Delete</button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
