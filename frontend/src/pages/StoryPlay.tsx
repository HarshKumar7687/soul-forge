import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { charactersApi } from "../api/characters";
import { ApiError } from "../api/client";
import { conversationsApi } from "../api/conversations";
import { storiesApi } from "../api/library";
import { Alert } from "../components/Alert";
import { Portrait } from "../components/Portrait";
import { Spinner } from "../components/Spinner";
import type { AiStatus, Character, CharacterBrief, Scene, Story } from "../types";

export function StoryPlay() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [story, setStory] = useState<Story | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [cast, setCast] = useState<CharacterBrief[]>([]);
  const [library, setLibrary] = useState<Character[]>([]);
  const [loadError, setLoadError] = useState("");
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [pendingInput, setPendingInput] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [warn, setWarn] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toAdd, setToAdd] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    storiesApi.get(id).then((d) => { setStory(d.story); setScenes(d.scenes); setCast(d.characters); })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : "Could not load this story"));
    charactersApi.list().then((r) => setLibrary(r.characters)).catch(() => {});
    conversationsApi.aiStatus().then(setAi).catch(() => {});
    return () => abortRef.current?.abort();
  }, [id]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [scenes, streamText, sending]);

  const advance = async (text: string) => {
    if (sending) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSending(true); setError(""); setWarn(""); setStreamText(""); setPendingInput(text);
    try {
      await storiesApi.continue(id, text, (e) => {
        if (e.type === "delta") setStreamText((t) => t + e.text);
        else if (e.type === "done") {
          setScenes((s) => [...s, e.scene]);
          setStory((st) => (st ? { ...st, state: e.state, sceneCount: st.sceneCount + 1 } : st));
          setStreamText(""); setPendingInput(null); setInput("");
          if (!e.stateUpdated) setWarn("The story tracker could not update after this scene. The scene is saved; continue as normal.");
        } else if (e.type === "error") { setError(e.message); setStreamText(""); }
      }, ctrl.signal);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      setStreamText("");
    } finally { setSending(false); }
  };
  const submit = () => { const t = input.trim(); if (t) advance(t); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } };

  const addCharacter = async () => {
    if (!toAdd) return;
    try {
      const r = await storiesApi.addCharacter(id, toAdd);
      setStory(r.story); setCast(r.characters); setToAdd("");
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not add that character"); }
  };
  const removeCharacter = async (cid: string) => {
    try { const r = await storiesApi.removeCharacter(id, cid); setStory(r.story); setCast((c) => c.filter((x) => x.id !== cid)); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not remove that character"); }
  };
  const remove = async () => {
    try { await storiesApi.remove(id); navigate("/stories", { replace: true }); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not delete the story"); setConfirmDelete(false); }
  };

  if (loadError) return <div className="py-16 text-center"><p className="text-mute">{loadError}</p><Link to="/stories" className="btn-ghost mt-6">Back to stories</Link></div>;
  if (!story) return <Spinner label="Opening story" />;

  const last = scenes[scenes.length - 1];
  const choices = !sending && last ? last.choices : [];
  const open = story.state.threads.filter((t) => !t.resolved);
  const addable = library.filter((c) => !story.characterIds.includes(c.id));
  const notConfigured = ai && !ai.configured;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="flex min-h-[60vh] flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold">{story.title}</h1>
            <p className="text-xs capitalize text-mute">{story.genre} · {scenes.length} scene{scenes.length === 1 ? "" : "s"}</p>
          </div>
          {confirmDelete ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="hidden text-mute sm:inline">Delete this story?</span>
              <button className="btn-danger !px-3 !py-1.5" onClick={remove}>Delete</button>
              <button className="btn-ghost !px-3 !py-1.5" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          ) : <button className="btn-ghost !px-3 !py-1.5" onClick={() => setConfirmDelete(true)}>Delete story</button>}
        </header>

        {notConfigured && <div className="mt-3"><Alert>AI is not configured. Set <code>LLM_API_KEY</code> and <code>LLM_MODEL</code> in <code>backend/.env</code> and restart the server to write new scenes. You can still read this story.</Alert></div>}

        <div role="log" aria-live="polite" className="flex-1 space-y-6 py-6">
          {scenes.length === 0 && !sending && (
            <div className="surface p-6 text-center">
              <p className="text-mute">{story.initialSituation || "Your story is ready."}</p>
              <button className="btn-primary mt-5" onClick={() => advance("")} disabled={!!notConfigured}>Begin the story</button>
            </div>
          )}
          {scenes.map((s) => (
            <article key={s.id} className="space-y-3">
              {s.userInput && <div className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-2.5 text-sm text-white">{s.userInput}</p></div>}
              <p className="whitespace-pre-wrap leading-relaxed">{s.narration}</p>
            </article>
          ))}
          {sending && pendingInput && <div className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-2.5 text-sm text-white">{pendingInput}</p></div>}
          {sending && streamText && <p className="whitespace-pre-wrap leading-relaxed">{streamText}</p>}
          {sending && !streamText && (
            <div role="status" aria-label="The narrator is writing" className="flex gap-1.5">
              {[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-pulse rounded-full bg-mute" style={{ animationDelay: `${i * 160}ms` }} />)}
            </div>
          )}
          {warn && <Alert tone="success">{warn}</Alert>}
          {error && (
            <div className="space-y-2">
              <Alert>{error}</Alert>
              {pendingInput !== null && !sending && <button className="btn-ghost !py-1.5" onClick={() => advance(pendingInput)}>Try again</button>}
            </div>
          )}
          {choices.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Suggested actions">
              {choices.map((c) => <button key={c} className="btn-ghost !py-1.5 text-left" onClick={() => advance(c)}>{c}</button>)}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {scenes.length > 0 && (
          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-end gap-2 border-t border-line pt-3">
            <label htmlFor="act" className="sr-only">What do you do?</label>
            <textarea id="act" rows={1} className="input max-h-40 min-h-[44px] flex-1 resize-none" placeholder="What do you do or say? Or write your own twist." maxLength={2000}
              value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} disabled={sending} />
            <button className="btn-primary" disabled={sending || !input.trim()}>Send</button>
          </form>
        )}
      </div>

      <aside aria-label="Story tracker" className="space-y-4 text-sm lg:sticky lg:top-6 lg:self-start">
        <section className="surface p-4">
          <h2 className="font-bold">Now</h2>
          <p className="mt-1 text-mute">{story.state.currentScene || "The story has not started."}</p>
        </section>
        <section className="surface p-4">
          <h2 className="font-bold">Cast</h2>
          <ul className="mt-2 space-y-2">
            {cast.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <Portrait url={c.portraitUrl} name={c.name} className="h-7 w-7 rounded-full text-xs" />
                <span className="flex-1 truncate">{c.name}</span>
                <button className="text-xs text-mute hover:text-ink" onClick={() => removeCharacter(c.id)} aria-label={`Remove ${c.name} from the story`}>Remove</button>
              </li>
            ))}
            {story.state.participants.filter((p) => !cast.some((c) => c.name === p)).map((p) => <li key={p} className="text-mute">{p} <span className="text-xs">(introduced in story)</span></li>)}
          </ul>
          {addable.length > 0 && cast.length < 6 && (
            <div className="mt-3 flex gap-2">
              <label htmlFor="addc" className="sr-only">Add a character</label>
              <select id="addc" className="input !py-1.5" value={toAdd} onChange={(e) => setToAdd(e.target.value)}>
                <option value="">Add a character…</option>
                {addable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="btn-ghost !px-3 !py-1.5" onClick={addCharacter} disabled={!toAdd}>Add</button>
            </div>
          )}
        </section>
        {open.length > 0 && <section className="surface p-4"><h2 className="font-bold">Open threads</h2><ul className="mt-2 list-disc space-y-1 pl-4 text-mute">{open.map((t) => <li key={t.text}>{t.text}</li>)}</ul></section>}
        {story.state.relationships.length > 0 && <section className="surface p-4"><h2 className="font-bold">Relationships</h2><ul className="mt-2 space-y-1 text-mute">{story.state.relationships.map((r) => <li key={`${r.a}-${r.b}`}><span className="text-ink">{r.a} and {r.b}:</span> {r.note}</li>)}</ul></section>}
        {story.state.events.length > 0 && <section className="surface p-4"><h2 className="font-bold">Key events</h2><ul className="mt-2 list-disc space-y-1 pl-4 text-mute">{story.state.events.slice(-8).map((e, i) => <li key={i}>{e}</li>)}</ul></section>}
      </aside>
    </div>
  );
}
