"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Bot, ChevronDown, Loader2, Send, Sparkles, X } from "lucide-react";
import { API_BASE } from "@/lib/api";

const SUGGESTIONS = [
  "How many critical signalling failures are open?",
  "What maintenance is due today?",
  "Which maintenance tasks are overdue?",
  "Are there repeated asset failures?",
  "Are there maintenance and block conflicts?",
];

export function AIAssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState(SUGGESTIONS);

  if (pathname === "/login") return null;

  async function ask(text: string) {
    const q = text.trim(); if (!q || busy) return;
    setQuestion(q); setBusy(true);
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("nexora_auth") : null;
      const token = raw ? JSON.parse(raw)?.access_token : "";
      const res = await fetch(`${API_BASE}/api/smms/copilot`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ question: q }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail || "Assistant request failed");
      setAnswer(body.answer || "I don't have enough data to answer that yet.");
      setSuggestions(["What should I check next?", ...SUGGESTIONS.filter(x => x !== q)].slice(0, 5));
    } catch (e: any) { setAnswer(e?.message || "The assistant could not reach the backend."); }
    finally { setBusy(false); }
  }

  return <>
    {open && <div className="fixed bottom-20 right-5 z-[100] w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15"><Bot className="h-4 w-4 text-primary"/></span><div><div className="text-sm font-semibold">NEXORA AI Assistant</div><div className="text-[10px] text-muted-foreground">Live operational data assistant</div></div></div><button onClick={()=>setOpen(false)} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4"/></button></div>
      <div className="max-h-[420px] overflow-y-auto p-3 space-y-3">
        {answer && <div className="rounded-xl bg-muted/50 p-3 text-xs leading-relaxed">{answer}</div>}
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Suggested questions</div>
        <div className="space-y-1.5">{suggestions.map((s,i)=><button key={`${s}-${i}`} onClick={()=>ask(s)} disabled={busy} className="w-full rounded-lg border border-border px-3 py-2 text-left text-[11px] hover:bg-muted disabled:opacity-50">{s}</button>)}</div>
      </div>
      <div className="border-t border-border p-3"><div className="flex gap-2"><input value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')ask(question)}} placeholder="Ask about operations…" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs"/><button onClick={()=>ask(question)} disabled={busy || !question.trim()} className="rounded-lg bg-primary px-3 text-primary-foreground disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}</button></div></div>
    </div>}
    <button onClick={()=>setOpen(v=>!v)} aria-label="Open AI Assistant" className="fixed bottom-5 right-5 z-[101] flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl ring-4 ring-background hover:scale-105 transition-transform"><Sparkles className="h-5 w-5"/>{!open && <span className="absolute inset-0 rounded-full animate-ping bg-primary/20"/>}</button>
  </>;
}
