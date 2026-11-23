import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { favoritesApi } from "../api/library";
import { useAuth } from "../context/AuthContext";

export function FavoriteButton({ id, initial, onChange }: { id: string; initial: boolean; onChange?: (v: boolean) => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setOn(initial), [initial]);

  const toggle = async () => {
    if (!user) { navigate("/login", { state: { from: location.pathname + location.search } }); return; }
    const next = !on;
    setOn(next); setBusy(true);
    try {
      await (next ? favoritesApi.add(id) : favoritesApi.remove(id));
      onChange?.(next);
    } catch { setOn(!next); } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={toggle} disabled={busy} aria-pressed={on} className={`btn-ghost !py-1.5 ${on ? "!border-ember/60 !text-ember" : ""}`}>
      {on ? "Saved" : "Save"}
    </button>
  );
}
