import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { conversationsApi, type ChatDetail, type StreamEvent } from "../api/conversations";
import { ApiError } from "../api/client";
import { Alert } from "../components/Alert";
import { Portrait } from "../components/Portrait";
import { RichText } from "../components/RichText";
import { Spinner } from "../components/Spinner";
import { authApi } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import type { AiStatus, Message } from "../types";

interface ChatError { code: string; message: string }

export function Chat() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadError, setLoadError] = useState("");
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<ChatError | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { user, setUser } = useAuth();
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    conversationsApi.get(id)
      .then((d) => { setDetail(d); setMessages(d.messages); })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : "Could not load this conversation"));
    conversationsApi.aiStatus().then(setAi).catch(() => {});
    return () => abortRef.current?.abort();
  }, [id]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, streamText, sending, error]);

  const run = useCallback(async (start: (cb: (e: StreamEvent) => void, signal: AbortSignal) => Promise<void>, restore?: string) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSending(true); setError(null); setStreamText("");
    let sawUser = false;
    try {
      await start((e) => {
        if (e.type === "user") {
          sawUser = true;
          setMessages((m) => [...m.filter((x) => x.id !== "pending"), e.message]);
        } else if (e.type === "delta") {
          setStreamText((t) => t + e.text);
        } else if (e.type === "done") {
          setMessages((m) => [...m.filter((x) => x.id !== e.replacedId), e.message]);
          setStreamText("");
        } else if (e.type === "error") {
          setError({ code: e.code, message: e.message });
          setStreamText("");
        }
      }, ctrl.signal);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      if (!sawUser) {
        setMessages((m) => m.filter((x) => x.id !== "pending"));
        if (restore) setInput(restore);
      }
      setStreamText("");
      setError(e instanceof ApiError ? { code: e.code, message: e.message } : { code: "internal", message: "Something went wrong. Try again." });
    } finally {
      setSending(false);
    }
  }, []);

  const send = () => {
    const content = input.trim();
    if (!content || sending) return;
    setInput("");
    setMessages((m) => [...m, { id: "pending", conversationId: id, role: "user", kind: "message", content, createdAt: new Date().toISOString() }]);
    run((cb, signal) => conversationsApi.send(id, content, cb, signal), content);
  };
  const regenerate = () => { if (!sending) run((cb, signal) => conversationsApi.regenerate(id, cb, signal)); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };
  const changeLength = async (value: "short" | "medium" | "long") => {
    try { setUser((await authApi.updateProfile({ replyLength: value })).user); }
    catch (e) { setError({ code: "settings", message: e instanceof ApiError ? e.message : "Could not change the reply length" }); }
  };
  const remove = async () => {
    try { await conversationsApi.remove(id); navigate("/chats", { replace: true }); }
    catch (e) { setError({ code: "delete", message: e instanceof ApiError ? e.message : "Could not delete the conversation" }); setConfirmDelete(false); }
  };

  if (loadError) return (
    <div className="py-16 text-center">
      <p className="text-mute">{loadError}</p>
      <Link to="/chats" className="btn-ghost mt-6">Back to chats</Link>
    </div>
  );
  if (!detail) return <Spinner label="Opening conversation" />;

  const ch = detail.character;
  const last = messages[messages.length - 1];
  const canRegenerate = !sending && last?.role === "assistant" && last.kind === "reply";
  const canRetry = !sending && !!error && last?.role === "user";
  const notConfigured = ai && !ai.configured;

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] min-h-[420px] max-w-3xl flex-col">
      <header className="flex items-center gap-3 border-b border-line pb-3">
        <Portrait url={ch?.portraitUrl} name={ch?.name ?? detail.conversation.title} className="h-11 w-11 rounded-full text-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight">{ch?.name ?? detail.conversation.title}</h1>
          <p className="truncate text-xs text-mute">{ch?.shortDescription || "Conversation"}</p>
        </div>
        <div>
          <label htmlFor="len" className="sr-only">Reply length</label>
          <select id="len" className="input !w-auto !py-1.5 !text-xs" title="How long the replies should be"
            value={user?.replyLength ?? ai?.replyLength ?? "short"} onChange={(e) => changeLength(e.target.value as "short" | "medium" | "long")}>
            <option value="short">Short replies</option>
            <option value="medium">Medium replies</option>
            <option value="long">Long replies</option>
          </select>
        </div>
        {detail.character && <Link to={`/memories?character=${detail.character.id}`} className="btn-ghost !px-3 !py-1.5">Memories</Link>}
        {confirmDelete ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-mute sm:inline">Delete this chat?</span>
            <button className="btn-danger !px-3 !py-1.5" onClick={remove}>Delete</button>
            <button className="btn-ghost !px-3 !py-1.5" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </div>
        ) : (
          <button className="btn-ghost !px-3 !py-1.5" onClick={() => setConfirmDelete(true)}>Delete chat</button>
        )}
      </header>

      {notConfigured && (
        <div className="mt-3">
          <Alert>AI chat is not configured. Set <code>LLM_API_KEY</code> and <code>LLM_MODEL</code> in <code>backend/.env</code> and restart the server. You can read this conversation, but replies cannot be generated yet.</Alert>
        </div>
      )}

      <div role="log" aria-live="polite" className="flex-1 space-y-4 overflow-y-auto py-5">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-[0.95rem] ${m.role === "user" ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-600/20" : "border border-line bg-panel"}`}>
              <RichText text={m.content} variant={m.role} />
            </div>
          </div>
        ))}
        {sending && streamText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl border border-line bg-panel px-4 py-3 text-[0.95rem]"><RichText text={streamText} /></div>
          </div>
        )}
        {sending && !streamText && (
          <div className="flex justify-start" role="status" aria-label={`${ch?.name ?? "Character"} is typing`}>
            <div className="flex gap-1.5 rounded-2xl border border-line bg-panel px-4 py-3.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-2 w-2 animate-pulse rounded-full bg-mute" style={{ animationDelay: `${i * 160}ms` }} />
              ))}
            </div>
          </div>
        )}
        {error && (
          <div className="space-y-2">
            <Alert>{error.message}</Alert>
            {canRetry && <button className="btn-ghost !py-1.5" onClick={regenerate}>Try again</button>}
          </div>
        )}
        {canRegenerate && !error && (
          <div className="flex justify-start"><button className="text-xs text-mute hover:text-ink" onClick={regenerate}>Regenerate response</button></div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2 border-t border-line pt-3">
        <label htmlFor="msg" className="sr-only">Message</label>
        <textarea id="msg" rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
          placeholder="Write a message. Use *asterisks* for actions." maxLength={4000}
          className="input max-h-40 min-h-[44px] flex-1 resize-none" disabled={sending} />
        <button className="btn-primary" disabled={sending || !input.trim()}>Send</button>
      </form>
    </div>
  );
}
