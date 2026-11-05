"use client";
import { useEffect, useState } from "react";
import { PageHeader, SectionCard, EmptyState } from "@/components/shared";
import { api } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, Loader2, Sparkles, Copy, Save, Clapperboard, History, Wand2, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const GENRES = [
  { value: "Cinematic", label: "Cinematic" },
  { value: "Product Ad", label: "Product Ad" },
  { value: "Tutorial", label: "Tutorial" },
  { value: "Documentary", label: "Documentary" },
  { value: "Social Media", label: "Social Media" },
  { value: "Story", label: "Story" },
];

interface Scene {
  index: number;
  heading: string;
  narration: string;
  visualPrompt: string;
  duration: number;
}
interface ScriptJson {
  title: string;
  logline: string;
  scenes: Scene[];
}

interface HistoryItem {
  title: string;
  idea: string;
  genre: string;
  at: number;
}

const HISTORY_KEY = "vortex:script-history";

export function ScriptGeneratorView() {
  const { setView } = useApp();
  const [idea, setIdea] = useState("");
  const [genre, setGenre] = useState("Cinematic");
  const [submitting, setSubmitting] = useState(false);
  const [script, setScript] = useState<{ text: string; json: ScriptJson | null } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (raw && !cancelled) setHistory(JSON.parse(raw));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  function saveHistory(items: HistoryItem[]) {
    setHistory(items);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    } catch {}
  }

  async function generate() {
    if (!idea.trim()) {
      toast.error("Please describe your idea.");
      return;
    }
    setSubmitting(true);
    // ASYNC: POST returns a job immediately, then we poll until done.
    // This avoids gateway 502 timeouts on long LLM script generation (~10s).
    const r = await api<{ job: any; async: boolean }>("/api/ai/text", {
      method: "POST",
      body: JSON.stringify({
        prompt: `${idea}\n\nGenre/style: ${genre}`,
        mode: "script",
        json: true,
      }),
    });
    if (!r.ok || !r.data?.job) {
      setSubmitting(false);
      toast.error(r.error || "Script generation failed.");
      return;
    }
    toast.info("AI is writing your script…");
    const jobId = r.data.job.id;
    // Poll until complete
    const poll = setInterval(async () => {
      const pr = await api<{ job: any }>(`/api/ai/text?id=${encodeURIComponent(jobId)}`);
      if (pr.ok && pr.data?.job) {
        const j = pr.data.job;
        if (j.status === "completed" && j.resultMeta) {
          clearInterval(poll);
          setSubmitting(false);
          const meta = JSON.parse(j.resultMeta);
          setScript({ text: meta.text, json: meta.json });
          toast.success("Script generated!");
          if (meta.json?.title) {
            const item: HistoryItem = {
              title: meta.json.title,
              idea,
              genre,
              at: Date.now(),
            };
            saveHistory([item, ...history].slice(0, 5));
          }
        } else if (j.status === "failed" || j.status === "expired") {
          clearInterval(poll);
          setSubmitting(false);
          toast.error(j.error || "Script generation failed.");
        }
      }
    }, 3000);
    // Safety timeout: 2 min
    setTimeout(() => { clearInterval(poll); setSubmitting(false); }, 120000);
  }

  async function copyScript() {
    if (!script?.text) return;
    try {
      await navigator.clipboard.writeText(script.text);
      toast.success("Script copied!");
    } catch {
      toast.error("Could not copy.");
    }
  }

  async function saveProject() {
    if (!script?.json) {
      toast.error("Nothing to save yet.");
      return;
    }
    const r = await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name: script.json.title || "Untitled script",
        type: "script",
        config: { script: script.json, genre },
      }),
    });
    if (r.ok) toast.success("Saved as project!");
    else toast.error(r.error || "Could not save project.");
  }

  function loadHistory(item: HistoryItem) {
    setIdea(item.idea);
    setGenre(item.genre);
  }

  return (
    <div>
      <PageHeader
        title="AI Script Generator"
        description="Turn a one-line idea into a structured, scene-by-scene video script — titles, loglines, narration and visual prompts, ready to direct."
        icon={<FileText className="h-5 w-5" />}
      />

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left: input */}
        <div className="lg:col-span-2 space-y-4">
          <SectionCard title="Concept">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Idea / concept</Label>
                <Textarea
                  rows={6}
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder="A 30-second teaser for a futuristic electric SUV launching at night in a rain-soaked city…"
                />
              </div>
              <div className="space-y-2">
                <Label>Genre / style</Label>
                <Select value={genre} onValueChange={setGenre}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GENRES.map((g) => (
                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SectionCard>

          <Button onClick={generate} disabled={submitting} size="lg" className="w-full gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {submitting ? "Writing script…" : "Generate Script"}
          </Button>

          {history.length > 0 && (
            <SectionCard title="Recent scripts" description="Quick-load your last 5 generations.">
              <div className="flex flex-wrap gap-2">
                {history.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => loadHistory(h)}
                    className="group flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs hover:border-primary hover:bg-accent/40 transition-all max-w-full"
                  >
                    <History className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate max-w-[160px]">{h.title}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{h.genre}</span>
                  </button>
                ))}
              </div>
            </SectionCard>
          )}
        </div>

        {/* Right: result */}
        <div className="lg:col-span-3">
          {script ? (
            <SectionCard
              title="Generated script"
              description="Structured into scenes. Direct each scene into a video."
              actions={
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={copyScript} className="gap-1.5">
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                  <Button variant="ghost" size="sm" onClick={saveProject} className="gap-1.5">
                    <Save className="h-3.5 w-3.5" /> Save
                  </Button>
                </div>
              }
            >
              {script.json ? (
                <ScriptResult json={script.json} onMakeVideo={() => setView("video-generator")} />
              ) : (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm whitespace-pre-wrap leading-relaxed">
                  {script.text}
                </div>
              )}
            </SectionCard>
          ) : (
            <SectionCard title="Generated script">
              <EmptyState
                icon={<FileText className="h-6 w-6" />}
                title="No script yet"
                description="Describe your idea on the left, pick a genre, and generate a structured, scene-by-scene script."
              />
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

function ScriptResult({
  json, onMakeVideo,
}: { json: ScriptJson; onMakeVideo: () => void }) {
  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border bg-gradient-to-br from-primary/5 to-transparent p-4"
      >
        <h2 className="text-xl font-bold tracking-tight">{json.title}</h2>
        {json.logline && (
          <p className="text-sm text-muted-foreground mt-1 italic">{json.logline}</p>
        )}
      </motion.div>

      <div className="space-y-3 max-h-[640px] overflow-y-auto scrollbar-thin pr-1">
        {json.scenes?.map((s, i) => (
          <motion.div
            key={s.index ?? i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.05, 0.4) }}
            className="rounded-lg border bg-card p-4"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="grid place-items-center h-7 w-7 rounded-md bg-primary/10 text-primary text-xs font-semibold">
                  {s.index ?? i + 1}
                </span>
                <h4 className="font-semibold text-sm">{s.heading}</h4>
              </div>
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Clock className="h-3 w-3" /> {s.duration}s
              </Badge>
            </div>
            {s.narration && (
              <p className="text-sm italic text-foreground/90 leading-relaxed">“{s.narration}”</p>
            )}
            {s.visualPrompt && (
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                <span className="font-medium not-italic text-foreground/70">Visual: </span>
                {s.visualPrompt}
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={onMakeVideo}
                className="h-7 gap-1.5"
              >
                <Clapperboard className="h-3.5 w-3.5" /> Generate video from this scene
              </Button>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center justify-end">
        <Button onClick={onMakeVideo} className="gap-2">
          <Sparkles className="h-4 w-4" /> Continue to Video Generator
        </Button>
      </div>
    </div>
  );
}
