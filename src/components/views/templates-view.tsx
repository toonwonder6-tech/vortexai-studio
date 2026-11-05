"use client";
import { useEffect, useState } from "react";
import { PageHeader, SectionCard, EmptyState } from "@/components/shared";
import { api, timeAgo } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  LayoutTemplate, Plus, Loader2, Trash2, Copy, Wand2, FileText, Globe, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "cinematic", label: "Cinematic" },
  { value: "advertising", label: "Advertising" },
  { value: "character", label: "Character" },
  { value: "scene", label: "Scene" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

interface Template {
  id: string;
  title: string;
  content: string;
  category: string;
  isPublic: boolean;
  createdAt: string;
  userId: string | null;
}

interface FormState {
  title: string;
  content: string;
  category: Category;
  isPublic: boolean;
}

const EMPTY_FORM: FormState = {
  title: "",
  content: "",
  category: "general",
  isPublic: false,
};

export function TemplatesView() {
  const { setView } = useApp();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Category>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [expanded, setExpanded] = useState<Template | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const r = await api<{ templates: Template[] }>("/api/templates");
      if (!cancelled) {
        if (r.ok && r.data) setTemplates(r.data.templates);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function refresh() {
    setLoading(true);
    const r = await api<{ templates: Template[] }>("/api/templates");
    if (r.ok && r.data) setTemplates(r.data.templates);
    setLoading(false);
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  async function save() {
    if (!form.title.trim()) {
      toast.error("Please enter a title.");
      return;
    }
    if (!form.content.trim()) {
      toast.error("Please enter the template content.");
      return;
    }
    setSaving(true);
    const r = await api("/api/templates", {
      method: "POST",
      body: JSON.stringify({
        title: form.title.trim(),
        content: form.content.trim(),
        category: form.category,
        isPublic: form.isPublic,
      }),
    });
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error || "Create failed");
      return;
    }
    toast.success("Template saved.");
    setDialogOpen(false);
    await refresh();
  }

  async function copyContent(t: Template) {
    try {
      await navigator.clipboard.writeText(t.content);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Could not copy.");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const r = await api(`/api/templates?id=${deleteTarget.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!r.ok) {
      toast.error(r.error || "Delete failed");
      return;
    }
    toast.success("Template deleted.");
    setDeleteTarget(null);
    await refresh();
  }

  const filtered = templates.filter((t) => filter === "all" || t.category === filter);

  return (
    <div>
      <PageHeader
        title="Prompt Templates"
        description="Save and reuse your best prompts. Build a personal library of cinematic, advertising, character and scene templates — use them with one click in the Prompt Assistant."
        icon={<LayoutTemplate className="h-5 w-5" />}
        actions={
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> New Template
          </Button>
        }
      />

      <SectionCard
        title="Templates"
        description={`${templates.length} template${templates.length === 1 ? "" : "s"}`}
        actions={
          <Button variant="ghost" size="sm" onClick={refresh} className="gap-1.5">
            Refresh
          </Button>
        }
      >
        <div className="flex flex-wrap gap-2 mb-4">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" />
          {CATEGORIES.map((c) => (
            <FilterChip
              key={c.value}
              active={filter === c.value}
              onClick={() => setFilter(c.value)}
              label={c.label}
            />
          ))}
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<LayoutTemplate className="h-6 w-6" />}
            title={templates.length === 0 ? "No templates yet" : "No matches"}
            description={
              templates.length === 0
                ? "Save your favorite prompts as templates to reuse them across the studio."
                : "Try a different category filter."
            }
            action={
              templates.length === 0 ? (
                <Button onClick={openNew} className="gap-2">
                  <Plus className="h-4 w-4" /> Create template
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[760px] overflow-y-auto scrollbar-thin pr-1">
            {filtered.map((t, i) => (
              <TemplateCard
                key={t.id}
                template={t}
                index={i}
                onExpand={() => setExpanded(t)}
                onCopy={() => copyContent(t)}
                onUse={() => setView("prompt-assistant")}
                onDelete={() => setDeleteTarget(t)}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* New template dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New template</DialogTitle>
            <DialogDescription>
              Save a reusable prompt template for the studio tools.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Cinematic product reveal"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v as Category }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                rows={6}
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="A cinematic wide shot of…"
                className="font-mono text-xs"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                {form.isPublic ? (
                  <Globe className="h-4 w-4 text-primary" />
                ) : (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <Label htmlFor="pub" className="cursor-pointer">Public template</Label>
                  <p className="text-xs text-muted-foreground">
                    Public templates are shared across the studio community.
                  </p>
                </div>
              </div>
              <Switch
                id="pub"
                checked={form.isPublic}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isPublic: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expand dialog */}
      <Dialog open={!!expanded} onOpenChange={(o) => !o && setExpanded(null)}>
        <DialogContent className="sm:max-w-2xl">
          {expanded && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate pr-8">{expanded.title}</DialogTitle>
                <DialogDescription>
                  <span className="capitalize">{expanded.category}</span> · {timeAgo(expanded.createdAt)}
                  {expanded.isPublic && " · public"}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border bg-muted p-4 max-h-[55vh] overflow-y-auto scrollbar-thin">
                <p className="text-sm font-mono whitespace-pre-wrap leading-relaxed">{expanded.content}</p>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => copyContent(expanded)} className="gap-1.5">
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setExpanded(null);
                    setView("prompt-assistant");
                  }}
                  className="gap-1.5"
                >
                  <Wand2 className="h-3.5 w-3.5" /> Use in Assistant
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This template will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90 gap-2"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FilterChip({
  active, onClick, label,
}: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card hover:bg-accent/60 text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function TemplateCard({
  template, index, onExpand, onCopy, onUse, onDelete,
}: {
  template: Template;
  index: number;
  onExpand: () => void;
  onCopy: () => void;
  onUse: () => void;
  onDelete: () => void;
}) {
  const catLabel = CATEGORIES.find((c) => c.value === template.category)?.label || template.category;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="rounded-lg border bg-card p-4 flex flex-col group hover:border-primary/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="grid place-items-center h-8 w-8 rounded-lg bg-primary/10 text-primary shrink-0">
            <FileText className="h-4 w-4" />
          </div>
          <h4 className="font-semibold text-sm truncate">{template.title}</h4>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <Badge variant="secondary" className="text-[10px]">{catLabel}</Badge>
        {template.isPublic ? (
          <Badge variant="outline" className="text-[10px] gap-1">
            <Globe className="h-3 w-3" /> Public
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] gap-1">
            <Lock className="h-3 w-3" /> Private
          </Badge>
        )}
      </div>
      <button
        onClick={onExpand}
        className="text-left text-xs text-muted-foreground line-clamp-3 flex-1 hover:text-foreground transition-colors"
      >
        {template.content}
      </button>
      <div className="flex items-center justify-between mt-3 pt-3 border-t">
        <span className="text-[10px] text-muted-foreground">{timeAgo(template.createdAt)}</span>
        <div className="flex items-center gap-0.5">
          <Button size="sm" variant="ghost" onClick={onCopy} className="h-7 w-7 p-0" aria-label="Copy">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" aria-label="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={onUse} className="h-7 ml-1 gap-1.5 text-xs">
            <Wand2 className="h-3.5 w-3.5" /> Use
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
