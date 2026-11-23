import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { Alert } from "../components/Alert";
import { Field } from "../components/Field";
import { useAuth } from "../context/AuthContext";

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/dashboard";
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await login(form.email, form.password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-md px-5 py-12">
      <h1 className="text-3xl font-bold">Welcome back</h1>
      <p className="mt-2 text-mute">Sign in to pick up where you left off.</p>
      <form onSubmit={submit} className="surface mt-8 space-y-4 p-6" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" required />
        <Field label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" required />
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="mt-6 text-sm text-mute">New here? <Link to="/register" className="text-glass hover:underline">Create an account</Link></p>
    </div>
  );
}
