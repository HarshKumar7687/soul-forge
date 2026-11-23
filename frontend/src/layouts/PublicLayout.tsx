import { Link, Outlet } from "react-router-dom";
import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";

export function PublicLayout() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2 text-sm">
          <ThemeToggle />
          <Link to="/explore" className="rounded-lg px-3 py-2 text-mute hover:text-ink">Explore</Link>
          {user ? (
            <Link to="/dashboard" className="btn-ghost">Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="rounded-lg px-3 py-2 text-mute hover:text-ink">Sign in</Link>
              <Link to="/register" className="btn-primary">Get started</Link>
            </>
          )}
        </nav>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="mx-auto w-full max-w-6xl px-5 py-8 text-sm text-mute">
        © {new Date().getFullYear()} SoulForge AI
      </footer>
    </div>
  );
}
