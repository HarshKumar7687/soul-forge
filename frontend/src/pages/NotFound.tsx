import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-5 text-center">
      <div>
        <h1 className="text-4xl font-bold">Page not found</h1>
        <p className="mt-3 text-mute">The page you are looking for does not exist or has moved.</p>
        <Link to="/" className="btn-primary mt-8">Go home</Link>
      </div>
    </div>
  );
}
