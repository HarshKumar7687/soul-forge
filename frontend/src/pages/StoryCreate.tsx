import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { charactersApi } from "../api/characters";
import { ApiError } from "../api/client";
import { storiesApi } from "../api/library";
import { Alert } from "../components/Alert";
import { Field, TextArea } from "../components/Field";
import { Portrait } from "../components/Portrait";
import { conversationsApi } from "../api/conversations";
import { GENRES, type AiStatus, type Character } from "../types";

export function StoryCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: "", genre: "adventure", contentRating: "general", setting: "", initialSituation: "" });
  const [picked, setPicked] = useState<string[]>([]);
  const [library, setLibrary] = useState<Character[] | null>(null);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [ai, setAi] = useState<AiStatus | null>(null);
  useEffect(() => { conversationsApi.aiStatus().then(setAi).catch(() => {}); }, []);
  useEffect(() => { charactersApi.list().then((r) => setLibrary(r.characters)).catch(() => setLibrary([])); }, []);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 6 ? [...p, id] : p));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setFields({ title: "Give your story a title" }); return; }
    setBusy(true); setError(""); setFields({});
    try {
      const { story } = await storiesApi.create({ ...form, characterIds: picked });
      navigate(`/stories/${story.id}`);
    } catch (err) {
      if (err instanceof ApiError) { setError(err.message); setFields(err.fields); } else setError("Something went wrong. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-5" noValidate>
      <h1 className="text-3xl font-bold">New story</h1>
      {error && <Alert>{error}</Alert>}
      <section className="surface space-y-4 p-5 sm:p-6">
        <Field label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} error={fields.title} maxLength={120} />
        <div>
          <label htmlFor="genre" className="mb-1.5 block text-sm font-medium">Genre</label>
          <select id="genre" className="input" value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })}>
            {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="rating" className="mb-1.5 block text-sm font-medium">Content rating</label>
          <select id="rating" className="input" value={form.contentRating} onChange={(e) => setForm({ ...form, contentRating: e.target.value })}>
            <option value="general">General</option>
            <option value="mature" disabled={ai ? !ai.matureAllowed : false}>Mature (18+): adult characters only</option>
          </select>
          {ai && !ai.matureAllowed && <p className="mt-1.5 text-xs text-mute">Mature is off. Set <code>ALLOW_MATURE_CONTENT=true</code> in <code>backend/.env</code>.</p>}
          {form.contentRating === "mature" && <p className="mt-1.5 text-xs text-mute">Every cast member needs an age of 18 or older.</p>}
        </div>
        <TextArea label="Setting" value={form.setting} onChange={(e) => setForm({ ...form, setting: e.target.value })} hint="Where and when, the tone, the rules of this world" maxLength={1500} rows={4} />
        <TextArea label="Initial situation" value={form.initialSituation} onChange={(e) => setForm({ ...form, initialSituation: e.target.value })} hint="What is happening as the story opens" maxLength={1500} rows={3} />
      </section>

      <section className="surface space-y-3 p-5 sm:p-6">
        <div><h2 className="text-lg font-bold">Cast</h2><p className="text-sm text-mute">Choose up to 6 characters from your library. You can add more later, and new characters can appear in the story itself.</p></div>
        {library === null && <p className="text-sm text-mute">Loading your characters…</p>}
        {library?.length === 0 && <p className="text-sm text-mute">Your library is empty. <Link to="/characters/new" className="text-glass hover:underline">Create a character</Link>, or start without one.</p>}
        <ul className="grid gap-2 sm:grid-cols-2">
          {library?.map((c) => (
            <li key={c.id}>
              <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${picked.includes(c.id) ? "border-ember bg-raised" : "border-line"}`}>
                <input type="checkbox" className="accent-ember" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
                <Portrait url={c.portraitUrl} name={c.name} className="h-9 w-9 rounded-full text-sm" />
                <span className="min-w-0 truncate text-sm font-medium">{c.name}</span>
              </label>
            </li>
          ))}
        </ul>
        {fields.characterIds && <p className="text-xs text-danger">{fields.characterIds}</p>}
      </section>

      <div className="flex gap-3 pb-8">
        <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create story"}</button>
        <Link to="/stories" className="btn-ghost">Cancel</Link>
      </div>
    </form>
  );
}
