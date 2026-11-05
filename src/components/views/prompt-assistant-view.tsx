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
  Sparkles, Loader2, Wand2, Copy, Save, Clapperboard, FileText, BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const MODES = [
  { value: "improve", label: "Improve Prompt" },
  { value: "cinematic", label: "Cinematic" },
  { value: "advertising", label: "Advertising" },
  { value: "character", label: "Character" },
  { value: "scene", label: "Scene" },
];

interface Template {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: string;
}

const FIELD_LABELS: Record<string, string> = {
  prompt: "Prompt",
  negativePrompt: "Negative prompt",
  cameraMovement: "Camera movement",
  lighting: "Lighting",
  shotType: "Shot type",
  lens: "Lens",
  colorGrade: "Color grade",
  productFocus: "Product focus",
  mood: "Mood",
  appearance: "Appearance",
  clothing: "Clothing",
  expression: "Expression",
  setting: "Setting",
  timeOfDay: "Time of day",
  weather: "Weather",
  tags: "Tags",
};

export function PromptAssistantView() {
  const { setView } = useApp();
  const [idea, setIdea] = useState("");
  const [mode, setMode] = useState("improve");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await api<{ templates: Template[] }>("/api/templates");
      if (!cancelled && r.ok && r.data) setTemplates(r.data.templates);
    })();
    return () => { cancelled = true; };
  }, []);

  async function refreshTemplates() {
    const r = await api<{ templates: Template[] }>("/api/templates");
    if (r.ok && r.data) setTemplates(r.data.templates);
  }

  async function generate() {
    if (!idea.trim()) {
      toast.error("Write your idea first.");
      return;
    }
    setSubmitting(true);
    const r = await api<{ result: Record<string, any>; raw: string }>("/api/ai/prompt", {
      method: "POST",
      body: JSON.stringify({ prompt: idea, mode, style: "cinematic" }),
    });
    setSubmitting(false);
    if (!r.ok || !r.data) {
      toast.error(r.error || "Prompt generation failed.");
      return;
    }
    setResult(r.data.result);
    toast.success("Prompt crafted!");
  }

  async function copyPrompt() {
    const p = result?.prompt;
    if (!p) return;
    try {
      await navigator.clipboard.writeText(p);
      toast.success("Prompt copied!");
    } catch {
      toast.error("Could not copy.");
    }
  }

  async function saveTemplate() {
    const p = result?.prompt;
    if (!p) {
      toast.error("Generate a prompt first.");
      return;
    }
    const r = await api("/api/templates", {
      method: "POST",
      body: JSON.stringify({
        title: p.slice(0, 40),
        content: p,
        category: mode,
      }),
    });
    if (r.ok) {
      toast.success("Saved as template!");
      refreshTemplates();
    } else {
      toast.error(r.error || "Could not save template.");
    }
  }

  function loadTemplate(t: Template) {
    setIdea(t.content);
    setResult(null);
    toast.info(`Loaded "${t.title}"`);
  }

  const otherEntries = result
    ? Object.entries(result).filter(([k]) => k !== "prompt")
    : [];

  return (
    <div>
      <PageHeader
        title="AI Prompt Assistant"
        description="Craft vivid, production-ready prompts for video and image generation. Choose a mode, drop in a rough idea, and get a structured, cinematic prompt back."
        icon={<Sparkles className="h-5 w-5" />}
        actions={
          <Button variant="outline" onClick={() => setView("video-generator")} className="gap-2">
            <Clapperboard className="h-4 w-4" /> Video Generator
          </Button>
        }
      />

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left: input + result */}
        <div className="lg:col-span-3 space-y-4">
          <SectionCard title="Your idea">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Your idea</Label>
                <Textarea
                  rows={5}
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder="A neon-lit night market in Tokyo, steam rising from food stalls, a traveler walking through…"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select value={mode} onValueChange={setMode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </SectionCard>

          <Button onClick={generate} disabled={submitting} size="lg" className="w-full gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {submitting ? "Crafting prompt…" : "Generate Prompt"}
          </Button>

          {result ? (
            <SectionCard
              title="Result"
              description="Structured prompt ready for the studio tools."
              actions={
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={copyPrompt} className="gap-1.5">
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                  <Button variant="ghost" size="sm" onClick={saveTemplate} className="gap-1.5">
                    <Save className="h-3.5 w-3.5" /> Save as template
                  </Button>
                </div>
              }
            >
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-transparent p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="text-[10px]">Prompt</Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">{mode}</Badge>
                  </div>
                  <p className="text-sm leading-relaxed font-medium">{result.prompt}</p>
                </div>

                {otherEntries.length > 0 && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {otherEntries.map(([k, v]) => (
                      <div key={k} className="rounded-lg border bg-card p-3">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {FIELD_LABELS[k] || k}
                        </p>
                        <p className="text-sm mt-1 leading-snug">
                          {Array.isArray(v) ? v.join(", ") : String(v ?? "")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button onClick={() => setView("video-generator")} className="gap-2">
                    <Clapperboard className="h-4 w-4" /> Use in Video Generator
                  </Button>
                </div>
              </motion.div>
            </SectionCard>
          ) : (
            <SectionCard title="Result">
              <EmptyState
                icon={<Sparkles className="h-6 w-6" />}
                title="No prompt yet"
                description="Drop in a rough idea, pick a mode, and craft a structured, production-ready prompt."
              />
            </SectionCard>
          )}
        </div>

        {/* Right: templates sidebar */}
        <div className="lg:col-span-2">
          <SectionCard
            title="Prompt templates"
            description="Click a template to load it into the input."
            actions={
              <Button variant="ghost" size="sm" onClick={refreshTemplates} className="gap-1.5">
                Refresh
              </Button>
            }
          >
            {templates.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="h-6 w-6" />}
                title="No templates yet"
                description="Save your favorite prompts as templates to reuse them later."
              />
            ) : (
              <div className="space-y-2 max-h-[640px] overflow-y-auto scrollbar-thin pr-1">
                {templates.map((t, i) => (
                  <motion.button
                    key={t.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    onClick={() => loadTemplate(t)}
                    className="w-full text-left rounded-lg border bg-card p-3 hover:border-primary hover:bg-accent/40 transition-all group"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="text-sm font-medium truncate">{t.title}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize shrink-0">{t.category}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.content}</p>
                  </motion.button>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
