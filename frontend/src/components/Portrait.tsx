import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function Portrait({ url, name, className = "" }: { url?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => setFailed(false), [url]);

  // Escape closes the viewer, and the page behind it stops scrolling while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const previous = document.body.style.overflow;
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!url || failed) {
    return (
      <div aria-hidden className={`grid place-items-center bg-raised font-display text-3xl font-bold text-mute ${className}`}>
        {name.trim().charAt(0).toUpperCase() || "?"}
      </div>
    );
  }

  const openViewer = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault(); // images inside a card link should enlarge, not navigate
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <img
        src={url}
        alt={`Portrait of ${name}`}
        className={`cursor-zoom-in object-cover transition-transform hover:scale-105 ${className}`}
        loading="lazy"
        tabIndex={0}
        onClick={openViewer}
        onKeyDown={(e) => { if (e.key === "Enter") openViewer(e); }}
        onError={() => setFailed(true)}
      />

      {/* Rendered on document.body so cards (overflow, blur, transforms) cannot clip or shrink it */}
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Portrait of ${name}`}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
            onClick={() => setOpen(false)}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-6 top-6 text-4xl leading-none text-white hover:text-gray-300"
              aria-label="Close enlarged image"
            >
              &times;
            </button>
            <img
              src={url}
              alt={`Portrait of ${name}`}
              className="h-[90vh] w-[90vw] rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body
        )}
    </>
  );
}