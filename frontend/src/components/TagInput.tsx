import { useId, useState, type KeyboardEvent } from "react";

export function TagInput({ label, value, onChange, error, max = 12 }: {
  label: string; value: string[]; onChange: (v: string[]) => void; error?: string; max?: number;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim().slice(0, 30);
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase()) && value.length < max) onChange([...value, t]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
    else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      <div className="input flex flex-wrap items-center gap-1.5 !py-2">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-md bg-raised px-2 py-0.5 text-xs">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((v) => v !== t))} className="text-mute hover:text-ink">×</button>
          </span>
        ))}
        <input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={add}
          placeholder={value.length ? "" : "Type a trait, press Enter"} className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none" />
      </div>
      <p className={`mt-1.5 text-xs ${error ? "text-danger" : "text-mute"}`}>{error ?? `${value.length}/${max}`}</p>
    </div>
  );
}
