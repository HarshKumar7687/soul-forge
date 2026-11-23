import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { charactersApi } from "../api/characters";
import { conversationsApi } from "../api/conversations";
import { ApiError } from "../api/client";
import { Alert } from "../components/Alert";
import { CharacterPreview } from "../components/CharacterPreview";
import { Field, TextArea } from "../components/Field";
import { Spinner } from "../components/Spinner";
import { TagInput } from "../components/TagInput";
import { useStartChat } from "../hooks/useStartChat";
import { CATEGORIES, type AiStatus, type CharacterInput } from "../types";

const empty: CharacterInput = {
  name: "", age: null, gender: "", category: "other", contentRating: "general", shortDescription: "", appearance: "",
  personalityTraits: [], backstory: "", speakingStyle: "", interests: "", dislikes: "", goals: "",
  relationshipWithUser: "", scenario: "", greeting: "", exampleDialogues: [],
  visibility: "private", status: "draft", portraitUrl: "",
};

function publishChecks(f: CharacterInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.name.trim()) e.name = "Give your character a name";
  if (!f.shortDescription.trim()) e.shortDescription = "Add a short description";
  if (!f.personalityTraits.length) e.personalityTraits = "Add at least one personality trait";
  if (!f.speakingStyle.trim()) e.speakingStyle = "Describe how they speak";
  if (!f.greeting.trim()) e.greeting = "Write a greeting message";
  return e;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="surface space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {hint && <p className="mt-1 text-sm text-mute">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function CharacterEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState<CharacterInput>(empty);
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<"" | "draft" | "publish" | "upload" | "generate">("");
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [extra, setExtra] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(
    (location.state as { saved?: string } | null)?.saved ? { tone: "success", text: (location.state as { saved: string }).saved } : null
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const chat = useStartChat();

  useEffect(() => { conversationsApi.aiStatus().then(setAi).catch(() => {}); }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    charactersApi.get(id)
      .then(({ character }) => {
        // Copy only the editable fields. The API also returns server-managed ones (counts, ids, dates)
        // that the update endpoint refuses.
        const src = character as unknown as Record<string, unknown>;
        const editable = Object.fromEntries(Object.keys(empty).map((k) => [k, src[k] ?? (empty as unknown as Record<string, unknown>)[k]]));
        setForm({ ...empty, ...editable, age: character.age ?? null } as CharacterInput);
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : "Could not load this character"))
      .finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof CharacterInput>(k: K, v: CharacterInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k: keyof CharacterInput) => (e: { target: { value: string } }) => set(k, e.target.value as never);

  const save = async (mode: "draft" | "publish") => {
    setMsg(null);
    const priv = form.contentRating === "mature" ? ({ visibility: "private" } as const) : {};
    const payload: CharacterInput =
      mode === "draft" ? { ...form, status: "draft", visibility: "private" } : { ...form, ...priv, status: "published" };
    const errs: Record<string, string> = mode === "publish" ? publishChecks(payload) : !payload.name.trim() ? { name: "Give your character a name" } : {};
    if (payload.contentRating === "mature" && !(payload.age != null && payload.age >= 18)) errs.age = "18+ characters need an age of 18 or older";
    setErrors(errs);
    if (Object.keys(errs).length) {
      setMsg({ tone: "error", text: "Fix the highlighted fields to continue." });
      return;
    }
    setBusy(mode);
    try {
      const label = mode === "draft" ? "Draft saved" : "Character published";
      if (id) {
        const { character } = await charactersApi.update(id, payload);
        setForm((f) => ({ ...f, status: character.status, visibility: character.visibility }));
        setMsg({ tone: "success", text: label });
      } else {
        const { character } = await charactersApi.create(payload);
        navigate(`/characters/${character.id}/edit`, { replace: true, state: { saved: label } });
      }
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fields);
        const detail = Object.entries(e.fields).map(([k, v]) => (k === "body" ? v : `${k}: ${v}`)).join("; ");
        setMsg({ tone: "error", text: detail ? `${e.message} (${detail})` : e.message });
      }
      else setMsg({ tone: "error", text: "Something went wrong. Try again." });
    } finally { setBusy(""); }
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy("upload"); setMsg(null);
    try {
      set("portraitUrl", (await charactersApi.uploadPortrait(file)).url);
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiError ? e.message : "Upload failed" });
    } finally { setBusy(""); if (fileRef.current) fileRef.current.value = ""; }
  };

  const generate = async () => {
    setBusy("generate"); setMsg(null);
    try {
      const { url } = await charactersApi.generatePortrait({
        name: form.name, age: form.age, gender: form.gender, category: form.category,
        shortDescription: form.shortDescription, appearance: form.appearance, extra,
      });
      set("portraitUrl", url);
      setMsg({ tone: "success", text: "Portrait generated. Save the character to keep it." });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiError ? e.message : "Portrait generation failed" });
    } finally { setBusy(""); }
  };

  if (loading) return <Spinner label="Loading character" />;
  if (loadError) return (
    <div className="py-16 text-center">
      <p className="text-mute">{loadError}</p>
      <Link to="/characters" className="btn-ghost mt-6">Back to library</Link>
    </div>
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{id ? "Edit character" : "Create a character"}</h1>
          <p className="mt-1 text-sm text-mute">
            {form.status === "published" ? (form.visibility === "public" ? "Published and public" : "Published, private") : "Draft"}
          </p>
        </div>
        <Link to="/characters" className="text-sm text-mute hover:text-ink">Back to library</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <form onSubmit={(e) => { e.preventDefault(); save(form.status === "published" ? "publish" : "draft"); }} className="space-y-5" noValidate>
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          {chat.error && <Alert>{chat.error}</Alert>}
          {id && <p className="text-sm text-mute">Save your changes first: “Try a conversation” uses the last saved version.</p>}

          <Section title="Identity">
            <Field label="Name" value={form.name} onChange={text("name")} error={errors.name} maxLength={60} required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Age" type="number" min={0} value={form.age ?? ""} error={errors.age} hint="Optional"
                onChange={(e) => set("age", e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))))} />
              <Field label="Gender" value={form.gender} onChange={text("gender")} error={errors.gender} hint="Optional" maxLength={40} />
              <div>
                <label htmlFor="rating" className="mb-1.5 block text-sm font-medium">Content rating</label>
                <select id="rating" className="input" value={form.contentRating} onChange={(e) => { set("contentRating", e.target.value as CharacterInput["contentRating"]); if (e.target.value === "mature") set("visibility", "private"); }}>
                  <option value="general">General</option>
                  <option value="mature" disabled={ai ? !ai.matureAllowed : false}>Mature (18+, private only)</option>
                </select>
                {ai && !ai.matureAllowed && <p className="mt-1.5 text-xs text-mute">Mature is off. Set <code>ALLOW_MATURE_CONTENT=true</code> in <code>backend/.env</code>.</p>}
                {form.contentRating === "mature" && <p className="mt-1.5 text-xs text-mute">Needs an age of 18+. Never shown publicly.</p>}
              </div>
              <div>
                <label htmlFor="category" className="mb-1.5 block text-sm font-medium">Category</label>
                <select id="category" className="input" value={form.category} onChange={text("category")}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <TextArea label="Short description" value={form.shortDescription} onChange={text("shortDescription")}
              error={errors.shortDescription} hint={`${form.shortDescription.length}/200`} maxLength={200} rows={2} />
            <div>
              <p className="mb-1.5 text-sm font-medium">Portrait</p>
              <div className="flex flex-wrap items-center gap-3">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="portrait"
                  onChange={(e) => onFile(e.target.files?.[0])} />
                <label htmlFor="portrait" className="btn-ghost cursor-pointer">{busy === "upload" ? "Uploading…" : form.portraitUrl ? "Replace image" : "Upload image"}</label>
                {form.portraitUrl && <button type="button" className="btn-ghost" onClick={() => set("portraitUrl", "")}>Remove</button>}
              </div>
              <p className="mt-1.5 text-xs text-mute">PNG, JPEG or WebP, up to 2 MB. A portrait is optional.</p>
              {ai?.image.configured ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label htmlFor="extra" className="sr-only">Extra portrait detail</label>
                  <input id="extra" className="input min-w-[12rem] flex-1" placeholder="Extra detail, e.g. golden hour, oil painting" maxLength={300} value={extra} onChange={(e) => setExtra(e.target.value)} />
                  <button type="button" className="btn-ghost" disabled={!!busy || !(form.appearance.trim() || form.shortDescription.trim() || extra.trim())} onClick={generate}>
                    {busy === "generate" ? "Generating… this can take a minute" : "Generate with AI"}
                  </button>
                </div>
              ) : ai ? (
                <p className="mt-2 text-xs text-mute">AI portraits are off. Set <code>IMAGE_API_KEY</code> and <code>IMAGE_MODEL</code> in <code>backend/.env</code> to enable them. Uploading works without it.</p>
              ) : null}
              {errors.portraitUrl && <p className="mt-1 text-xs text-danger">{errors.portraitUrl}</p>}
            </div>
          </Section>

          <Section title="Personality and voice">
            <TagInput label="Personality traits" value={form.personalityTraits} onChange={(v) => set("personalityTraits", v)} error={errors.personalityTraits} />
            <TextArea label="Speaking style" value={form.speakingStyle} onChange={text("speakingStyle")} error={errors.speakingStyle}
              hint="Tone, vocabulary, habits, accent" maxLength={1000} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextArea label="Interests" value={form.interests} onChange={text("interests")} error={errors.interests} maxLength={800} rows={3} />
              <TextArea label="Dislikes" value={form.dislikes} onChange={text("dislikes")} error={errors.dislikes} maxLength={800} rows={3} />
            </div>
          </Section>

          <Section title="Story">
            <TextArea label="Physical appearance" value={form.appearance} onChange={text("appearance")} error={errors.appearance} maxLength={1500} />
            <TextArea label="Background and backstory" value={form.backstory} onChange={text("backstory")} error={errors.backstory} maxLength={4000} rows={6} />
            <TextArea label="Goals and motivations" value={form.goals} onChange={text("goals")} error={errors.goals} maxLength={1000} />
          </Section>

          <Section title="Relationship and opening">
            <TextArea label="Relationship with the user" value={form.relationshipWithUser} onChange={text("relationshipWithUser")} error={errors.relationshipWithUser} maxLength={600} rows={3} />
            <TextArea label="Initial scenario" value={form.scenario} onChange={text("scenario")} error={errors.scenario} hint="Where and when the conversation begins" maxLength={1500} />
            <TextArea label="Greeting message" value={form.greeting} onChange={text("greeting")} error={errors.greeting} maxLength={1000} />
          </Section>

          <Section title="Example dialogues" hint="Optional. Short exchanges that show how they talk.">
            {form.exampleDialogues.map((d, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-line p-4">
                <TextArea label={`Example ${i + 1}: user says`} value={d.user} rows={2} maxLength={500}
                  onChange={(e) => set("exampleDialogues", form.exampleDialogues.map((x, j) => (j === i ? { ...x, user: e.target.value } : x)))} />
                <TextArea label="Character replies" value={d.character} rows={3} maxLength={1000}
                  onChange={(e) => set("exampleDialogues", form.exampleDialogues.map((x, j) => (j === i ? { ...x, character: e.target.value } : x)))} />
                <button type="button" className="btn-ghost !py-1.5" onClick={() => set("exampleDialogues", form.exampleDialogues.filter((_, j) => j !== i))}>Remove example</button>
              </div>
            ))}
            {errors.exampleDialogues && <p className="text-xs text-danger">{errors.exampleDialogues}</p>}
            {form.exampleDialogues.length < 6 && (
              <button type="button" className="btn-ghost" onClick={() => set("exampleDialogues", [...form.exampleDialogues, { user: "", character: "" }])}>Add example</button>
            )}
          </Section>

          <Section title="Visibility" hint="Only published, public characters appear to other people. Drafts and 18+ characters are always private.">
            <fieldset className="space-y-2">
              <legend className="sr-only">Visibility</legend>
              {(["private", "public"] as const).map((v) => (
                <label key={v} className="flex cursor-pointer items-center gap-3 text-sm">
                  <input type="radio" name="visibility" checked={form.visibility === v} disabled={v === "public" && form.contentRating === "mature"} onChange={() => set("visibility", v)} className="accent-ember" />
                  {v === "private" ? "Private: only you can use this character" : "Public: anyone can find and chat with this character"}
                </label>
              ))}
            </fieldset>
            {errors.visibility && <p className="text-xs text-danger">{errors.visibility}</p>}
          </Section>

          <div className="flex flex-wrap gap-3 pb-8">
            {form.status === "published" ? (
              <>
                <button type="submit" className="btn-primary" disabled={!!busy}>{busy === "publish" ? "Saving…" : "Save changes"}</button>
                <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => save("draft")}>{busy === "draft" ? "Saving…" : "Move back to draft"}</button>
              </>
            ) : (
              <>
                <button type="submit" className="btn-ghost" disabled={!!busy}>{busy === "draft" ? "Saving…" : "Save draft"}</button>
                <button type="button" className="btn-primary" disabled={!!busy} onClick={() => save("publish")}>{busy === "publish" ? "Publishing…" : "Publish"}</button>
              </>
            )}
            {id && (
              <button type="button" className="btn-ghost" disabled={!!busy || chat.busyId === id} onClick={() => chat.start(id)}>
                {chat.busyId === id ? "Opening…" : "Try a conversation"}
              </button>
            )}
          </div>
        </form>

        <div className="lg:sticky lg:top-6 lg:self-start"><CharacterPreview c={form} /></div>
      </div>
    </div>
  );
}
