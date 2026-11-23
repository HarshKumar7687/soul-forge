import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { charactersApi } from "../api/characters";
import { CardSkeleton, CharacterCard } from "../components/CharacterCard";
import { useAuth } from "../context/AuthContext";
import { CATEGORIES, type PublicCharacter } from "../types";

const steps = [
  { title: "Describe a character", text: "Give them a name, a past, a way of speaking and a reason to be here." },
  { title: "Start talking", text: "Chat one-to-one. They stay in character and remember what matters to you." },
  { title: "Bring them into a story", text: "Cast your characters in a tale and steer it with your own choices." },
];

export function Landing() {
  const { user } = useAuth();
  const [featured, setFeatured] = useState<PublicCharacter[] | null>(null);

  useEffect(() => {
    charactersApi.featured().then((r) => setFeatured(r.characters)).catch(() => setFeatured([]));
  }, []);
  const create = user ? "/characters/new" : "/register";

  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="hero-glow pointer-events-none absolute -right-40 -top-32 h-[560px] w-[560px] rounded-full opacity-60 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-14 sm:pt-24">
          <h1 className="hero-in max-w-3xl text-5xl font-bold leading-[1.05] sm:text-7xl">
            Create Characters.<br />Build Worlds.<br /><span className="text-gradient">Write Your Story.</span>
          </h1>
          <p className="hero-in mt-7 max-w-xl text-lg leading-relaxed text-mute" style={{ animationDelay: "120ms" }}>
            Design a character with a past, a voice and a point of view. Talk with them one-to-one, or bring
            several into a story that bends around your choices.
          </p>
          <div className="hero-in mt-9 flex flex-wrap gap-3" style={{ animationDelay: "220ms" }}>
            <Link to={create} className="btn-primary">Create Your Character</Link>
            <Link to="/explore" className="btn-ghost">Explore Characters</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-3xl font-bold">Featured characters</h2>
        <p className="mt-2 text-mute">Made by the community and shared publicly.</p>
        <div className="mt-8">
          {featured === null && <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <CardSkeleton key={i} />)}</div>}
          {featured?.length === 0 && (
            <div className="surface px-6 py-12 text-center">
              <p className="text-mute">No public characters yet. Publish one and it will appear here.</p>
              <Link to={create} className="btn-primary mt-5">Create the first one</Link>
            </div>
          )}
          {featured && featured.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((c) => <CharacterCard key={c.id} c={c} href={`/c/${c.id}`} showGreeting />)}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-3xl font-bold">Popular categories</h2>
        <ul className="mt-6 flex flex-wrap gap-2.5">
          {CATEGORIES.filter((c) => c !== "other").map((c) => (
            <li key={c}><Link to={`/explore?category=${c}`} className="inline-block rounded-full border border-line px-4 py-2 text-sm capitalize text-mute hover:bg-raised hover:text-ink">{c.replace("-", " ")}</Link></li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-3xl font-bold">How it works</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="surface p-6">
              <span className="font-display text-2xl font-bold text-ember">{i + 1}</span>
              <h3 className="mt-3 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-mute">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="surface p-8 sm:p-10">
          <h2 className="text-3xl font-bold">Interactive stories</h2>
          <p className="mt-3 max-w-2xl text-mute">
            Pick a genre, set the scene, cast characters from your library, and write the next move yourself.
            The story keeps track of events, relationships and open threads so it stays consistent.
          </p>
          <Link to={user ? "/stories/new" : "/register"} className="btn-ghost mt-6">Start a story</Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24 pt-8 text-center">
        <h2 className="mx-auto max-w-2xl text-4xl font-bold">Your first character is one idea away.</h2>
        <Link to={create} className="btn-primary mt-8">Create Your Character</Link>
      </section>
    </>
  );
}
