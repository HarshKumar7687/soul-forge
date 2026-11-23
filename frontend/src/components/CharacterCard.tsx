import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Character } from "../types";
import { Portrait } from "./Portrait";

type CardData = Pick<Character, "name" | "shortDescription" | "personalityTraits" | "portraitUrl" | "category"> &
  Partial<Pick<Character, "status" | "visibility" | "greeting" | "contentRating">>;

export function CharacterCard({ c, children, showStatus, href, creator, showGreeting }: {
  c: CardData; children?: ReactNode; showStatus?: boolean; href?: string; creator?: string; showGreeting?: boolean;
}) {
  return (
    <article className="surface card-hover flex flex-col overflow-hidden">
      {href ? <Link to={href} aria-label={`View ${c.name}`}><Portrait url={c.portraitUrl} name={c.name} className="aspect-[4/3] w-full" /></Link>
        : <Portrait url={c.portraitUrl} name={c.name} className="aspect-[4/3] w-full" />}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-bold leading-tight">{href ? <Link to={href} className="hover:underline">{c.name}</Link> : c.name || "Unnamed character"}</h3>
          {c.contentRating === "mature" && <span className="shrink-0 rounded-md bg-ember/15 px-2 py-0.5 text-xs text-ember">18+</span>}
          {showStatus && (
            <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs ${c.status === "published" ? "bg-glass/15 text-glass" : "bg-raised text-mute"}`}>
              {c.status === "published" ? (c.visibility === "public" ? "Public" : "Private") : "Draft"}
            </span>
          )}
        </div>
        {creator && <p className="text-xs text-mute">by {creator}</p>}
        <p className="mt-1.5 line-clamp-2 text-sm text-mute">{c.shortDescription || "No description yet."}</p>
        {c.personalityTraits.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {c.personalityTraits.slice(0, 4).map((t) => (
              <li key={t} className="rounded-md bg-raised px-2 py-0.5 text-xs text-ink">{t}</li>
            ))}
          </ul>
        )}
        {showGreeting && c.greeting && (
          <blockquote className="mt-3 line-clamp-3 rounded-lg border border-line bg-night/60 p-2.5 text-sm italic text-mute">{c.greeting}</blockquote>
        )}
        {children && <div className="mt-auto flex flex-wrap gap-2 pt-4">{children}</div>}
      </div>
    </article>
  );
}

export function CardSkeleton() {
  return (
    <div className="surface animate-pulse overflow-hidden" aria-hidden>
      <div className="aspect-[4/3] bg-raised" />
      <div className="space-y-3 p-4">
        <div className="h-5 w-2/3 rounded bg-raised" />
        <div className="h-3 w-full rounded bg-raised" />
        <div className="h-3 w-4/5 rounded bg-raised" />
      </div>
    </div>
  );
}
