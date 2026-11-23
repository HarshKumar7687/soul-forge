import { Link } from "react-router-dom";

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 font-display text-lg font-bold">
      <span aria-hidden className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-ember to-iris text-sm text-white shadow-md shadow-ember/30">S</span>
      SoulForge
    </Link>
  );
}
