import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import { Alert } from "../components/Alert";
import { Field, TextArea } from "../components/Field";
import { useAuth } from "../context/AuthContext";

export function Settings() {
  const { user, setUser, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [delError, setDelError] = useState("");

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      setUser((await authApi.updateProfile({ displayName, bio })).user);
      setMsg({ tone: "success", text: "Profile saved" });
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof ApiError ? err.message : "Could not save your profile" });
    } finally { setSaving(false); }
  };

  const remove = async (e: FormEvent) => {
    e.preventDefault();
    setDelError("");
    try {
      await deleteAccount(password);
      navigate("/", { replace: true });
    } catch (err) {
      setDelError(err instanceof ApiError ? err.message : "Could not delete your account");
    }
  };

  return (
    <div className="max-w-xl space-y-8">
      <h1 className="text-3xl font-bold">Account settings</h1>

      <form onSubmit={save} className="surface space-y-4 p-6">
        <h2 className="text-lg font-bold">Profile</h2>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Field label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <TextArea label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} hint={`${bio.length}/280`} />
        <p className="text-sm text-mute">Signed in as {user?.email}</p>
        <button className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
      </form>

      <section className="surface space-y-4 border-danger/30 p-6">
        <h2 className="text-lg font-bold">Delete account</h2>
        <p className="text-sm text-mute">This permanently removes your account and everything you created. It cannot be undone.</p>
        {!confirming ? (
          <button className="btn-danger" onClick={() => setConfirming(true)}>Delete my account</button>
        ) : (
          <form onSubmit={remove} className="space-y-4">
            {delError && <Alert>{delError}</Alert>}
            <Field label="Confirm with your password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <div className="flex gap-3">
              <button className="btn-danger">Delete permanently</button>
              <button type="button" className="btn-ghost" onClick={() => { setConfirming(false); setPassword(""); setDelError(""); }}>Cancel</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
