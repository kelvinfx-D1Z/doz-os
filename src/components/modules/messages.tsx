"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/doz/ui-primitives";
import { initials, avatarColor, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Loader2, Send, MessageSquare, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface Person { id: string; name: string; role: string; title: string | null }
interface Thread { user: Person; lastMessage: { body: string; createdAt: string; mine: boolean } | null; unread: number }
interface Msg { id: string; body: string; createdAt: string; readAt: string | null; mine: boolean }

export function Messages() {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openWith, setOpenWith] = useState<Person | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadThreads = useCallback(async () => {
    try {
      const r = await fetch("/api/doz/messages");
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      setThreads(j.threads);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load messages");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/doz/messages")
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
        return j;
      })
      .then((j) => { if (!cancelled) setThreads(j.threads); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load messages"); });
    return () => { cancelled = true; };
  }, []);

  const openThread = useCallback(async (person: Person) => {
    setOpenWith(person);
    setLoadingThread(true);
    setMsgs([]);
    try {
      const r = await fetch(`/api/doz/messages?with=${encodeURIComponent(person.id)}`);
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      setMsgs(j.messages);
      await loadThreads(); // unread count just changed
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open conversation");
    } finally {
      setLoadingThread(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  }, [loadThreads]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (sendingRef.current || !openWith) return;
    const body = text.trim();
    if (!body) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const r = await fetch("/api/doz/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: openWith.id, body }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      setMsgs((m) => [...m, j.message]);
      setText("");
      await loadThreads();
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send", { duration: 8000 });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  if (error) return <Card className="p-6"><p className="text-sm text-destructive">{error}</p></Card>;
  if (!threads) return <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;

  // ---- Conversation view ----
  if (openWith) {
    return (
      <Card className="flex h-[70vh] flex-col p-0">
        <div className="flex items-center gap-3 border-b border-border p-3">
          <Button variant="ghost" size="sm" onClick={() => { setOpenWith(null); loadThreads(); }} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <Avatar className="h-8 w-8">
            <AvatarFallback className={cn("text-xs font-semibold", avatarColor(openWith.name))}>
              {initials(openWith.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{openWith.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{openWith.title || openWith.role}</p>
          </div>
        </div>

        <div className="scroll-thin flex-1 space-y-2 overflow-y-auto p-4">
          {loadingThread ? (
            <Skeleton className="h-16 w-2/3" />
          ) : msgs.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-8 w-8" />}
              title="No messages yet"
              hint={`Say something to ${openWith.name}.`}
            />
          ) : (
            msgs.map((m) => (
              <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                    m.mine ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cn("mt-1 text-[10px]", m.mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {relativeTime(m.createdAt)}
                    {m.mine && m.readAt ? " · Read" : ""}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Message ${openWith.name}…`}
            className="flex-1"
          />
          <Button type="submit" disabled={sending || !text.trim()} className="gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </Button>
        </form>
      </Card>
    );
  }

  // ---- Thread list ----
  return (
    <Card className="p-5">
      <div className="space-y-1">
        {threads.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-8 w-8" />}
            title="Nobody to message yet"
            hint="Add an active team member first."
          />
        ) : (
          threads.map((t) => (
            <button
              key={t.user.id}
              onClick={() => openThread(t.user)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-accent"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className={cn("text-xs font-semibold", avatarColor(t.user.name))}>
                  {initials(t.user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{t.user.name}</p>
                  <Badge variant="outline" className="text-[9px]">{t.user.role}</Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {t.lastMessage ? `${t.lastMessage.mine ? "You: " : ""}${t.lastMessage.body}` : "No messages yet"}
                </p>
              </div>
              {t.unread > 0 && (
                <span className="ml-2 shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {t.unread}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </Card>
  );
}
