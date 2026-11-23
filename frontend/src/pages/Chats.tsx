import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { conversationsApi } from "../api/conversations";
import { ApiError } from "../api/client";
import { Alert } from "../components/Alert";
import { Portrait } from "../components/Portrait";
import type { ConversationSummary } from "../types";

export const timeAgo = (iso: string) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

export function ConversationRow({ c }: { c: ConversationSummary }) {
  return (
    <Link to={`/chats/${c.id}`} className="surface flex items-center gap-4 p-4 hover:bg-raised">
      <Portrait url={c.character?.portraitUrl} name={c.character?.name ?? c.title} className="h-12 w-12 shrink-0 rounded-full text-lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="truncate font-bold">{c.character?.name ?? c.title}</h2>
          <span className="shrink-0 text-xs text-mute">{timeAgo(c.lastMessageAt)}</span>
        </div>
        <p className="truncate text-sm text-mute">{c.lastMessagePreview || "No messages yet"}</p>
      </div>
    </Link>
  );
}

export function Chats() {
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    conversationsApi.list().then((r) => setItems(r.conversations))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your chats"));
  }, []);
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold">Chats</h1>
      <p className="mt-1 text-mute">Pick up any conversation where you left off.</p>
      {error && <div className="mt-6"><Alert>{error}</Alert></div>}
      <div className="mt-8 space-y-3">
        {items === null && !error && [0, 1, 2].map((i) => <div key={i} className="surface h-[82px] animate-pulse" aria-hidden />)}
        {items?.length === 0 && (
          <div className="surface px-6 py-14 text-center">
            <h2 className="text-xl font-bold">No conversations yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-mute">Open a character from your library and choose Chat to start one.</p>
            <Link to="/characters" className="btn-primary mt-6">Go to your characters</Link>
          </div>
        )}
        {items?.map((c) => <ConversationRow key={c.id} c={c} />)}
      </div>
    </div>
  );
}
