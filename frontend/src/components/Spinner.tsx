export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-mute">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-ember" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
