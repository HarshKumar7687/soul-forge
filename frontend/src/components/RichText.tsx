/** Narration between *asterisks* is shown in italics; everything else is dialogue. */
export function RichText({ text, variant = "assistant" }: { text: string; variant?: "assistant" | "user" }) {
  const parts = text.split(/(\*[^*\n]+\*)/g).filter(Boolean);
  const narration = variant === "user" ? "text-white/75" : "text-mute";
  return (
    <p className="whitespace-pre-wrap break-words leading-relaxed">
      {parts.map((p, i) =>
        p.length > 2 && p.startsWith("*") && p.endsWith("*")
          ? <em key={i} className={narration}>{p.slice(1, -1)}</em>
          : <span key={i}>{p}</span>
      )}
    </p>
  );
}
