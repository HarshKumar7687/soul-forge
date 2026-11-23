import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { storiesApi } from "../api/library";
import { Alert } from "../components/Alert";
import type { Story } from "../types";
import { timeAgo } from "./Chats";

export function StoryRow({ s }: { s: Story }) {
  return (
    <Link to={`/stories/${s.id}`} className="surface block p-5 hover:bg-raised">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="truncate text-lg font-bold">{s.title}</h2>
        <span className="shrink-0 text-xs text-mute">{timeAgo(s.lastActivityAt)}</span>
      </div>
      <p className="mt-1 text-sm capitalize text-mute">{s.genre}{s.contentRating === "mature" ? " · 18+" : ""} · {s.sceneCount} scene{s.sceneCount === 1 ? "" : "s"}</p>
      <p className="mt-2 line-clamp-2 text-sm text-mute">{s.state.currentScene || s.initialSituation || "Not started yet."}</p>
    </Link>
  );
}

export function Stories() {
  const [items, setItems] = useState<Story[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { storiesApi.list().then((r) => setItems(r.stories)).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load stories")); }, []);
  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-bold">Stories</h1><p className="mt-1 text-mute">Interactive tales that bend around your choices.</p></div>
        <Link to="/stories/new" className="btn-primary">New story</Link>
      </div>
      {error && <div className="mt-6"><Alert>{error}</Alert></div>}
      <div className="mt-8 space-y-3">
        {items === null && !error && [0, 1].map((i) => <div key={i} className="surface h-[110px] animate-pulse" aria-hidden />)}
        {items?.length === 0 && (
          <div className="surface px-6 py-14 text-center">
            <h2 className="text-xl font-bold">No stories yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-mute">Pick a genre, set the scene and cast your characters.</p>
            <Link to="/stories/new" className="btn-primary mt-6">Start a story</Link>
          </div>
        )}
        {items?.map((s) => <StoryRow key={s.id} s={s} />)}
      </div>
    </div>
  );
}
