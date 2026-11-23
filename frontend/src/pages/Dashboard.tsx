import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { charactersApi } from "../api/characters";
import { conversationsApi } from "../api/conversations";
import { favoritesApi, storiesApi } from "../api/library";
import { CardSkeleton, CharacterCard } from "../components/CharacterCard";
import { useAuth } from "../context/AuthContext";
import type { Character, ConversationSummary, PublicCharacter, Story } from "../types";
import { ConversationRow } from "./Chats";
import { StoryRow } from "./Stories";

export function Dashboard() {
  const { user } = useAuth();
  const [recent, setRecent] = useState<Character[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [convs, setConvs] = useState<ConversationSummary[] | null>(null);
  const [saved, setSaved] = useState<PublicCharacter[] | null>(null);
  const [stories, setStories] = useState<Story[] | null>(null);

  useEffect(() => {
    charactersApi.list().then((r) => setRecent(r.characters.slice(0, 3))).catch(() => { setFailed(true); setRecent([]); });
  conversationsApi.list().then((r) => setConvs(r.conversations.slice(0, 3))).catch(() => setConvs([]));
    favoritesApi.list().then((r) => setSaved(r.characters.slice(0, 3))).catch(() => setSaved([]));
    storiesApi.list().then((r) => setStories(r.stories.slice(0, 3))).catch(() => setStories([]));
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Hello, {user?.displayName}</h1>
          <p className="mt-1 text-mute">Your characters, conversations and stories gather here.</p>
        </div>
        <Link to="/characters/new" className="btn-primary">Create a character</Link>
      </div>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Recently created characters</h2>
          <Link to="/characters" className="text-sm text-glass hover:underline">View library</Link>
        </div>
        {recent === null && <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <CardSkeleton key={i} />)}</div>}
        {failed && <p className="text-sm text-danger">Could not load your characters.</p>}
        {recent && !failed && recent.length === 0 && (
          <div className="surface p-6 text-sm text-mute">You have not created any characters yet. Use “Create a character” to begin.</div>
        )}
        {recent && recent.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((c) => (
              <CharacterCard key={c.id} c={c} showStatus>
                <Link to={`/characters/${c.id}/edit`} className="btn-ghost !py-1.5">Edit</Link>
              </CharacterCard>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Recent conversations</h2>
          <Link to="/chats" className="text-sm text-glass hover:underline">All chats</Link>
        </div>
        {convs === null && <div className="surface h-[82px] animate-pulse" aria-hidden />}
        {convs?.length === 0 && <div className="surface p-6 text-sm text-mute">No conversations yet. Open a character and choose Chat.</div>}
        <div className="space-y-3">{convs?.map((c) => <ConversationRow key={c.id} c={c} />)}</div>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Active stories</h2>
          <Link to="/stories" className="text-sm text-glass hover:underline">All stories</Link>
        </div>
        {stories === null && <div className="surface h-[110px] animate-pulse" aria-hidden />}
        {stories?.length === 0 && <div className="surface p-6 text-sm text-mute">No stories yet. <Link to="/stories/new" className="text-glass hover:underline">Start one</Link>.</div>}
        <div className="space-y-3">{stories?.map((st) => <StoryRow key={st.id} s={st} />)}</div>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Saved characters</h2>
          <Link to="/explore" className="text-sm text-glass hover:underline">Explore more</Link>
        </div>
        {saved === null && <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <CardSkeleton key={i} />)}</div>}
        {saved?.length === 0 && <div className="surface p-6 text-sm text-mute">Nothing saved yet. Use Save on any character in Explore.</div>}
        {saved && saved.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((c) => <CharacterCard key={c.id} c={c} href={`/c/${c.id}`} />)}
          </div>
        )}
      </section>
    </div>
  );
}
