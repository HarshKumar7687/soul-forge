import { Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./layouts/AppLayout";
import { PublicLayout } from "./layouts/PublicLayout";
import { CharacterPage } from "./pages/CharacterPage";
import { Chat } from "./pages/Chat";
import { Chats } from "./pages/Chats";
import { CharacterEditor } from "./pages/CharacterEditor";
import { Characters } from "./pages/Characters";
import { Dashboard } from "./pages/Dashboard";
import { Explore } from "./pages/Explore";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Memories } from "./pages/Memories";
import { NotFound } from "./pages/NotFound";
import { Register } from "./pages/Register";
import { Settings } from "./pages/Settings";
import { StoryCreate } from "./pages/StoryCreate";
import { StoryPlay } from "./pages/StoryPlay";
import { Stories } from "./pages/Stories";

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/c/:id" element={<CharacterPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/characters" element={<Characters />} />
          <Route path="/characters/new" element={<CharacterEditor />} />
          <Route path="/characters/:id/edit" element={<CharacterEditor />} />
          <Route path="/chats" element={<Chats />} />
          <Route path="/chats/:id" element={<Chat />} />
          <Route path="/stories" element={<Stories />} />
          <Route path="/stories/new" element={<StoryCreate />} />
          <Route path="/stories/:id" element={<StoryPlay />} />
          <Route path="/memories" element={<Memories />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
