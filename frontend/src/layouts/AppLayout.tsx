import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";

const links = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/chats", label: "Chats" },
  { to: "/characters", label: "Characters" },
  { to: "/stories", label: "Stories" },
  { to: "/memories", label: "Memories" },
  { to: "/explore", label: "Explore" },
  { to: "/settings", label: "Settings" },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const signOut = async () => {
    await logout();
    navigate("/", { replace: true });
  };
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-night/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Logo to="/dashboard" />
          <div className="flex items-center gap-3 text-sm">
            <ThemeToggle />
            <span className="hidden text-mute sm:inline">{user?.displayName}</span>
            <button onClick={signOut} className="btn-ghost !px-3 !py-1.5">Sign out</button>
          </div>
        </div>
        <nav aria-label="Main" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 text-sm">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-1.5 ${isActive ? "bg-raised text-ink" : "text-mute hover:text-ink"}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8"><Outlet /></main>
    </div>
  );
}
