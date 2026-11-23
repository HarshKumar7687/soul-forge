import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { charactersApi } from "../api/characters";
import { ApiError } from "../api/client";
import { Alert } from "../components/Alert";
import { FavoriteButton } from "../components/FavoriteButton";
import { Portrait } from "../components/Portrait";
import { Spinner } from "../components/Spinner";
import { useAuth } from "../context/AuthContext";
import { useStartChat } from "../hooks/useStartChat";

type Loaded = Awaited<ReturnType<typeof charactersApi.publicGet>>;

export function CharacterPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const chat = useStartChat();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("inappropriate");
  const [details, setDetails] = useState("");

  useEffect(() => {
    setData(null); setError("");
    charactersApi.publicGet(id).then(setData).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load this character"));
  }, [id, user?.id]);

  const share = async () => {
    const url = `${window.location.origin}/c/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: data?.character.name, url });
      else { await navigator.clipboard.writeText(url); setNote({ tone: "success", text: "Link copied" }); }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNote({ tone: "error", text: `Copy this link: ${url}` });
    }
  };
  const report = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await charactersApi.report(id, { reason, details });
      setReporting(false); setDetails("");
      setNote({ tone: "success", text: "Thanks, your report was sent." });
    } catch (err) {
      setNote({ tone: "error", text: err instanceof ApiError ? err.message : "Could not send the report" });
    }
  };

  if (error) return (
    <div className="mx-auto max-w-md px-5 py-20 text-center">
      <h1 className="text-3xl font-bold">Character not found</h1>
      <p className="mt-3 text-mute">{error}. It may be private or removed.</p>
      <Link to="/explore" className="btn-primary mt-8">Explore characters</Link>
    </div>
  );
  if (!data) return <Spinner label="Loading character" />;

  const c = data.character;
  const meta = [c.age != null ? `${c.age}` : "", c.gender, c.category !== "other" ? c.category : ""].filter(Boolean).join(", ");
  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-5 py-10 md:grid-cols-[320px_1fr]">
      <Portrait url={c.portraitUrl} name={c.name} className="aspect-[4/5] w-full rounded-2xl border border-line" />
      <div>
        <h1 className="text-4xl font-bold">{c.name}</h1>
        {meta && <p className="mt-1 text-mute">{meta}</p>}
        {data.creator && <p className="mt-1 text-sm text-mute">Created by {data.creator.displayName}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn-primary" disabled={chat.busyId === c.id} onClick={() => chat.start(c.id)}>{chat.busyId === c.id ? "Opening…" : "Start chatting"}</button>
          {!data.isOwner && <FavoriteButton id={c.id} initial={data.isFavorite} />}
          <button className="btn-ghost" onClick={share}>Share</button>
          {data.isOwner && <Link to={`/characters/${c.id}/edit`} className="btn-ghost">Edit</Link>}
          {!data.isOwner && user && <button className="btn-ghost" onClick={() => setReporting((v) => !v)}>Report</button>}
        </div>
        <div className="mt-4 space-y-3">
          {note && <Alert tone={note.tone}>{note.text}</Alert>}
          {chat.error && <Alert>{chat.error}</Alert>}
          {reporting && (
            <form onSubmit={report} className="surface space-y-3 p-4">
              <label className="block text-sm font-medium" htmlFor="reason">Reason</label>
              <select id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="inappropriate">Inappropriate content</option>
                <option value="harassment">Harassment or hate</option>
                <option value="copyright">Copyright</option>
                <option value="other">Something else</option>
              </select>
              <label className="block text-sm font-medium" htmlFor="det">Details (optional)</label>
              <textarea id="det" className="input min-h-[72px]" maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
              <div className="flex gap-2"><button className="btn-primary !py-1.5">Send report</button><button type="button" className="btn-ghost !py-1.5" onClick={() => setReporting(false)}>Cancel</button></div>
            </form>
          )}
        </div>

        {c.shortDescription && <p className="mt-6 text-lg">{c.shortDescription}</p>}
        {c.personalityTraits.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5">{c.personalityTraits.map((t) => <li key={t} className="rounded-md bg-raised px-2.5 py-1 text-sm">{t}</li>)}</ul>
        )}
        {c.appearance && <section className="mt-6"><h2 className="text-lg font-bold">Appearance</h2><p className="mt-1 whitespace-pre-wrap text-mute">{c.appearance}</p></section>}
        {c.greeting && (
          <section className="mt-6">
            <h2 className="text-lg font-bold">Greeting</h2>
            <blockquote className="mt-2 whitespace-pre-wrap rounded-xl border border-line bg-panel p-4 italic text-mute">{c.greeting}</blockquote>
          </section>
        )}
        <p className="mt-8 text-sm text-mute">{c.favoriteCount} saved · {c.chatCount} chats</p>
      </div>
    </div>
  );
}
