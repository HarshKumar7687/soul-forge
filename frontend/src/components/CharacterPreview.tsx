import type { CharacterInput } from "../types";
import { Portrait } from "./Portrait";

export function CharacterPreview({ c }: { c: CharacterInput }) {
  const meta = [c.age != null ? `${c.age}` : "", c.gender, c.category !== "other" ? c.category : ""].filter(Boolean).join(", ");
  return (
    <aside aria-label="Live preview" className="surface overflow-hidden">
      <Portrait url={c.portraitUrl} name={c.name} className="aspect-[4/3] w-full" />
      <div className="space-y-3 p-5">
        <div>
          <h2 className="text-2xl font-bold">{c.name || "Your character"}</h2>
          {meta && <p className="text-sm text-mute">{meta}</p>}
        </div>
        <p className="text-sm text-mute">{c.shortDescription || "A short description will appear here."}</p>
        {c.personalityTraits.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {c.personalityTraits.map((t) => <li key={t} className="rounded-md bg-raised px-2 py-0.5 text-xs">{t}</li>)}
          </ul>
        )}
        <div className="rounded-xl border border-line bg-night/60 p-3.5">
          <p className="mb-1 text-xs text-mute">Greeting</p>
          <p className="whitespace-pre-wrap text-sm">{c.greeting || "Their first message will appear here."}</p>
        </div>
      </div>
    </aside>
  );
}
