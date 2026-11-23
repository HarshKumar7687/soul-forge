import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { Alert } from "../components/Alert";
import { Field } from "../components/Field";
import { useAuth } from "../context/AuthContext";

export function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ displayName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(""); setFields({});
    try {
      await register(form.email, form.password, form.displayName);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) { setError(err.message); setFields(err.fields); }
      else setError("Something went wrong. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-md px-5 py-12">
      <h1 className="text-3xl font-bold">Create your account</h1>
      <p className="mt-2 text-mute">Start forging characters in a minute.</p>
      <form onSubmit={submit} className="surface mt-8 space-y-4 p-6" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Display name" value={form.displayName} onChange={set("displayName")} error={fields.displayName} autoComplete="nickname" required />
        <Field label="Email" type="email" value={form.email} onChange={set("email")} error={fields.email} autoComplete="email" required />
        <Field label="Password" type="password" value={form.password} onChange={set("password")} error={fields.password}
          hint="At least 8 characters, with a letter and a number" autoComplete="new-password" required />
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
      </form>
      <p className="mt-6 text-sm text-mute">Already have an account? <Link to="/login" className="text-glass hover:underline">Sign in</Link></p>
    </div>
  );
}
