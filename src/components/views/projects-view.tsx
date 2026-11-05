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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FolderOpen, Plus, Loader2, Trash2, Clapperboard, Archive, Film, Image as ImageIcon,
  Mic, Wand2, FileText, Scissors,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const PROJECT_TYPES = [
  { value: "video", label: "Video", icon: Film },
  { value: "image", label: "Image", icon: ImageIcon },
  { value: "director", label: "AI Director", icon: Wand2 },
  { value: "audio", label: "Audio", icon: Mic },
  { value: "script", label: "Script", icon: FileText },
  { value: "editor", label: "Editor", icon: Scissors },
] as const;

type ProjectType = (typeof PROJECT_TYPES)[number]["value"];

interface ProjectCount {
  jobs: number;
  assets: number;
}
interface Project {
  id: string;
  name: string;
  type: string;
  status: string;
  description: string | null;
  config: any;
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: ProjectCount;
}

interface Asset {
  id: string;
  type: string;
  name: string;
  url: string;
  size: number;
  createdAt: string;
}

interface FormState {
  name: string;
  type: ProjectType;
  description: string;
}

const EMPTY_FORM: FormState = { name: "", type: "video", description: "" };

export function ProjectsView() {
  const { setView } = useApp();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | ProjectType>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<Project | null>(null);
  const [detailAssets, setDetailAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const r = await api<{ projects: Project[] }>("/api/projects");
      if (!cancelled) {
        if (r.ok && r.data) setProjects(r.data.projects);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function refresh() {
    setLoading(true);
    const r = await api<{ projects: Project[] }>("/api/projects");
    if (r.ok && r.data) setProjects(r.data.projects);
    setLoading(false);
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("Please enter a project name.");
      return;
    }
    setSaving(true);
    const r = await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name: form.name.trim(),
        type: form.type,
        description: form.description.trim() || null,
        config: {},
      }),
    });
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error || "Create failed");
      return;
    }
    toast.success("Project created.");
    setDialogOpen(false);
    await refresh();
  }

  async function openDetail(p: Project) {
    setDetail(p);
    setDetailAssets([]);
    setLoadingAssets(true);
    const r = await api<{ assets: Asset[] }>(`/api/assets?projectId=${p.id}&limit=50`);
    if (r.ok && r.data) setDetailAssets(r.data.assets);
    setLoadingAssets(false);
  }

  async function archiveProject() {
    if (!detail) return;
    setArchiving(true);
    const r = await api("/api/projects", {
      method: "PATCH",
      body: JSON.stringify({ id: detail.id, status: "archived" }),
    });
    setArchiving(false);
    if (!r.ok) {
      toast.error(r.error || "Archive failed");
      return;
    }
    toast.success("Project archived.");
    setDetail(null);
    await refresh();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const r = await api(`/api/projects?id=${deleteTarget.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!r.ok) {
      toast.error(r.error || "Delete failed");
      return;
    }
    toast.success("Project deleted.");
    setDeleteTarget(null);
    await refresh();
  }

  const filtered = projects.filter((p) => filter === "all" || p.type === filter);

  return (
    <div>
      <PageHeader
        title="My Projects"
        description="Organize your creative work into projects. Each project groups related jobs, assets and configuration — open one to keep working."
        icon={<FolderOpen className="h-5 w-5" />}
        actions={
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> New Project
          </Button>
        }
      />

      <SectionCard
        title="Projects"
        description={`${projects.length} project${projects.length === 1 ? "" : "s"}`}
        actions={
          <Button variant="ghost" size="sm" onClick={refresh} className="gap-1.5">
            Refresh
          </Button>
        }
      >
        <div className="flex flex-wrap gap-2 mb-4">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" />
          {PROJECT_TYPES.map((t) => (
            <FilterChip
              key={t.value}
              active={filter === t.value}
              onClick={() => setFilter(t.value)}
              label={t.label}
            />
          ))}
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-56 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="h-6 w-6" />}
            title={projects.length === 0 ? "No projects yet" : "No matches"}
            description={
              projects.length === 0
                ? "Create your first project to group related generations and assets together."
                : "Try a different project type filter."
            }
            action={
              projects.length === 0 ? (
                <Button onClick={openNew} className="gap-2">
                  <Plus className="h-4 w-4" /> Create project
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[760px] overflow-y-auto scrollbar-thin pr-1">
            {filtered.map((p, i) => (
              <ProjectCard
                key={p.id}
                project={p}
                index={i}
                onOpen={() => openDetail(p)}
                onDelete={() => setDeleteTarget(p)}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* New project dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Group related generations and assets under a single project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Spring product launch video"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as ProjectType }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What is this project about?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto scrollbar-thin">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate pr-8">{detail.name}</DialogTitle>
                <DialogDescription>
                  {PROJECT_TYPES.find((t) => t.value === detail.type)?.label || detail.type} · {timeAgo(detail.updatedAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-[10px] capitalize">{detail.type}</Badge>
                <Badge
                  variant={detail.status === "archived" ? "outline" : "default"}
                  className="text-[10px] capitalize"
                >
                  {detail.status || "active"}
                </Badge>
                {detail._count && (
                  <span className="text-xs text-muted-foreground">
                    {detail._count.jobs} job{detail._count.jobs === 1 ? "" : "s"} · {detail._count.assets} asset{detail._count.assets === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              {detail.description && (
                <p className="text-sm text-muted-foreground">{detail.description}</p>
              )}

              {detail.config && Object.keys(detail.config).length > 0 && (
                <div>
                  <Label className="mb-1.5 block">Configuration</Label>
                  <pre className="text-[11px] font-mono bg-muted rounded-lg p-3 overflow-x-auto max-h-60 scrollbar-thin">
                    {JSON.stringify(detail.config, null, 2)}
                  </pre>
                </div>
              )}

              <div>
                <Label className="mb-1.5 block">Related assets</Label>
                {loadingAssets ? (
                  <div className="h-20 rounded-lg bg-muted animate-pulse" />
                ) : detailAssets.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No assets linked to this project yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto scrollbar-thin">
                    {detailAssets.map((a) => (
                      <div key={a.id} className="rounded-md border bg-card overflow-hidden">
                        <div className="aspect-square bg-muted">
                          {a.type === "image" && (
                            <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                          )}
                          {a.type === "video" && (
                            <video src={a.url} muted className="h-full w-full object-cover" />
                          )}
                          {a.type === "audio" && (
                            <div className="h-full grid place-items-center">
                              <Mic className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] truncate px-1.5 py-1">{a.name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button
                  size="sm"
                  onClick={() => {
                    setDetail(null);
                    setView("video-generator");
                  }}
                  className="gap-1.5"
                >
                  <Clapperboard className="h-4 w-4" /> Open Video Generator
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={archiveProject}
                  disabled={archiving || detail.status === "archived"}
                  className="gap-1.5"
                >
                  {archiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                  {detail.status === "archived" ? "Archived" : "Archive"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDeleteTarget(detail);
                    setDetail(null);
                  }}
                  className="gap-1.5 text-destructive hover:text-destructive ml-auto"
                >
                  <Trash2 className="h-4 w-4" /> Delete
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
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The project and its configuration will be permanently removed. Linked assets are kept in your library.
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
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors capitalize ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card hover:bg-accent/60 text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function ProjectCard({
  project, index, onOpen, onDelete,
}: {
  project: Project;
  index: number;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const typeMeta = PROJECT_TYPES.find((t) => t.value === project.type);
  const Icon = typeMeta?.icon || FolderOpen;
  const isArchived = project.status === "archived";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="rounded-lg border bg-card overflow-hidden group flex flex-col"
    >
      <button
        onClick={onOpen}
        className="relative aspect-video block overflow-hidden text-left"
      >
        {project.coverUrl ? (
          project.coverUrl.match(/\.(mp4|webm|mov)$/i) ? (
            <video src={project.coverUrl} className="h-full w-full object-cover" muted preload="metadata" playsInline />
          ) : (
            <img src={project.coverUrl} alt={project.name} className="h-full w-full object-cover" loading="lazy" />
          )
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/15 via-primary/5 to-chart-2/10 grid place-items-center">
            <Icon className="h-8 w-8 text-primary/70" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors grid place-items-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium text-white bg-black/40 px-2.5 py-1 rounded-full">
            Open project
          </span>
        </div>
        <div className="absolute top-2 left-2 flex gap-1.5">
          <Badge variant="secondary" className="text-[10px] capitalize bg-background/90">
            {typeMeta?.label || project.type}
          </Badge>
          {isArchived && (
            <Badge variant="outline" className="text-[10px] bg-background/90">archived</Badge>
          )}
        </div>
      </button>
      <div className="p-3 flex flex-col flex-1">
        <h4 className="font-semibold text-sm truncate">{project.name}</h4>
        {project.description ? (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 flex-1">
            {project.description}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/60 mt-1 italic flex-1">No description</p>
        )}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{project._count?.jobs ?? 0} jobs</span>
            <span className="opacity-50">·</span>
            <span>{project._count?.assets ?? 0} assets</span>
            <span className="opacity-50">·</span>
            <span>{timeAgo(project.updatedAt)}</span>
          </div>
          <button
            onClick={onDelete}
            className="grid place-items-center h-7 w-7 rounded-md hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
            aria-label="Delete project"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
