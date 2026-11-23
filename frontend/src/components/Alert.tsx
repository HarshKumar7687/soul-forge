import type { ReactNode } from "react";

export function Alert({ tone = "error", children }: { tone?: "error" | "success"; children: ReactNode }) {
  const styles =
    tone === "error"
      ? "border-danger/40 bg-danger/10 text-danger"
      : "border-glass/40 bg-glass/10 text-glass";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}
