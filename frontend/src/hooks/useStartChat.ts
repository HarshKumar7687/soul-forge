import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { conversationsApi } from "../api/conversations";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

export function useStartChat() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const start = async (characterId: string) => {
    if (!user) { navigate("/login", { state: { from: location.pathname + location.search } }); return; }
    setBusyId(characterId); setError("");
    try {
      const { conversation } = await conversationsApi.create(characterId);
      navigate(`/chats/${conversation.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start the conversation");
    } finally { setBusyId(null); }
  };
  return { start, busyId, error };
}
