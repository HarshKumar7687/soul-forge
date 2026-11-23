import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

interface Common { label: string; error?: string; hint?: string }

export function Field({ label, error, hint, ...props }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      <input id={id} className="input" aria-invalid={!!error} aria-describedby={`${id}-m`} {...props} />
      <p id={`${id}-m`} className={`mt-1.5 text-xs ${error ? "text-danger" : "text-mute"}`}>{error ?? hint}</p>
    </div>
  );
}

export function TextArea({ label, error, hint, ...props }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      <textarea id={id} className="input min-h-[96px] resize-y" aria-invalid={!!error} {...props} />
      <p className={`mt-1.5 text-xs ${error ? "text-danger" : "text-mute"}`}>{error ?? hint}</p>
    </div>
  );
}
