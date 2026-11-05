"use client";
import { useEffect, useRef, useState } from "react";
import { PageHeader, SectionCard, EmptyState } from "@/components/shared";
import { api } from "@/lib/client";
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
  Users, Plus, Loader2, Upload, Edit3, Trash2, Clapperboard, Image as ImageIcon,
  Link2, X, Search,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const CATEGORIES = [
  { value: "character", label: "Character" },
  { value: "product", label: "Product" },
  { value: "logo", label: "Logo" },
  { value: "mascot", label: "Mascot" },
  { value: "clothing", label: "Clothing" },
  { value: "background", label: "Background" },
  { value: "style", label: "Visual Style" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

interface Character {
  id: string;
  name: string;
  description: string | null;
  category: string;
  referenceUrl: string | null;
  meta: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  name: string;
  description: string;
  category: Category;
  referenceUrl: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  category: "character",
  referenceUrl: "",
};

export function CharacterLibraryView() {
  const { setView } = useApp();
  const [items, setItems] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [query, setQuery] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Character | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    const r = await api<{ characters: Character[] }>("/api/characters");
    if (r.ok && r.data) setItems(r.data.characters);
    setLoading(false);
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(c: Character) {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description || "",
      category: (c.category as Category) || "character",
      referenceUrl: c.referenceUrl || "",
    });
    setDialogOpen(true);
  }

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", file.name);
      const res = await fetch("/api/assets", { method: "POST", body: fd });
      const json = await res.json();
      if (json.ok) {
        setForm((f) => ({ ...f, referenceUrl: json.data.asset.url }));
        toast.success("Reference image uploaded.");
      } else {
        toast.error(json.error || "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("Please enter a name.");
      return;
    }
    setSaving(true);
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category,
      referenceUrl: form.referenceUrl.trim() || null,
      meta: null,
    };
    if (editing) {
      const r = await api("/api/characters", {
        method: "PATCH",
        body: JSON.stringify({ id: editing.id, ...body }),
      });
      setSaving(false);
      if (!r.ok) {
        toast.error(r.error || "Update failed");
        return;
      }
      toast.success("Item updated.");
    } else {
      const r = await api("/api/characters", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSaving(false);
      if (!r.ok) {
        toast.error(r.error || "Create failed");
        return;
      }
      toast.success("Item added to library.");
    }
    setDialogOpen(false);
    await refresh();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const r = await api(`/api/characters?id=${deleteTarget.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!r.ok) {
      toast.error(r.error || "Delete failed");
      return;
    }
    toast.success("Item deleted.");
    setDeleteTarget(null);
    await refresh();
  }

  const filtered = items.filter((c) => {
    const matchesCat = filter === "all" || c.category === filter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q || c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q);
    return matchesCat && matchesQuery;
  });

  return (
    <div>
      <PageHeader
        title="Character Library"
        description="Build a reusable library of characters, products, logos, mascots, clothing, backgrounds and visual styles — reference them across any project or video generation."
        icon={<Users className="h-5 w-5" />}
        actions={
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> New Item
          </Button>
        }
      />

      <SectionCard
        title="Library"
        description={`${items.length} item${items.length === 1 ? "" : "s"} total`}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="h-8 w-44 pl-8 text-xs"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={refresh} className="gap-1.5">
              Refresh
            </Button>
          </div>
        }
      >
        {/* Category chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          <CategoryChip
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label="All"
            count={items.length}
          />
          {CATEGORIES.map((c) => {
            const count = items.filter((i) => i.category === c.value).length;
            return (
              <CategoryChip
                key={c.value}
                active={filter === c.value}
                onClick={() => setFilter(c.value)}
                label={c.label}
                count={count}
              />
            );
          })}
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-64 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title={items.length === 0 ? "No items yet" : "No matches"}
            description={
              items.length === 0
                ? "Add your first character, product, logo or background to reuse across projects."
                : "Try a different category or search term."
            }
            action={
              items.length === 0 ? (
                <Button onClick={openNew} className="gap-2">
                  <Plus className="h-4 w-4" /> Add first item
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[720px] overflow-y-auto scrollbar-thin pr-1">
            {filtered.map((c, i) => (
              <CharacterCard
                key={c.id}
                character={c}
                index={i}
                onEdit={() => openEdit(c)}
                onDelete={() => setDeleteTarget(c)}
                onUse={() => setView("video-generator")}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>{editing ? "Edit item" : "New library item"}</DialogTitle>
            <DialogDescription>
              Add a reusable reference — characters, products, logos, mascots, clothing, backgrounds or visual styles.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-4 overflow-y-auto scrollbar-thin flex-1">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Captain Nova, Product bottle, Brand mascot…"
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
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Describe appearance, personality, key visual traits, usage notes…"
              />
            </div>

            <div className="space-y-2">
              <Label>Reference image</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onUpload(e.target.files?.[0])}
              />
              {form.referenceUrl ? (
                <div className="relative aspect-video rounded-lg overflow-hidden border group">
                  <img src={form.referenceUrl} alt="reference" className="h-full w-full object-cover" />
                  <button
                    onClick={() => setForm((f) => ({ ...f, referenceUrl: "" }))}
                    className="absolute top-1 right-1 grid place-items-center h-6 w-6 rounded-full bg-background/80"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full aspect-video rounded-lg border-2 border-dashed grid place-items-center hover:border-primary hover:bg-accent/40 transition-all disabled:opacity-60"
                >
                  <div className="text-center">
                    {uploading ? (
                      <Loader2 className="h-5 w-5 mx-auto text-muted-foreground animate-spin" />
                    ) : (
                      <Upload className="h-5 w-5 mx-auto text-muted-foreground" />
                    )}
                    <span className="text-[10px] text-muted-foreground mt-1 block">
                      {uploading ? "Uploading…" : "Upload reference image"}
                    </span>
                  </div>
                </button>
              )}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={form.referenceUrl}
                    onChange={(e) => setForm((f) => ({ ...f, referenceUrl: e.target.value }))}
                    placeholder="…or paste an image URL"
                    className="pl-8 text-xs h-8"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-card shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {editing ? "Save changes" : "Add to library"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the item from your library. Projects that reference it are not affected.
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

function CategoryChip({
  active, onClick, label, count,
}: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card hover:bg-accent/60 text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      <span className={`text-[10px] ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
        {count}
      </span>
    </button>
  );
}

function CharacterCard({
  character, index, onEdit, onDelete, onUse,
}: {
  character: Character;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onUse: () => void;
}) {
  const catLabel = CATEGORIES.find((c) => c.value === character.category)?.label || character.category;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="rounded-lg border bg-card overflow-hidden flex flex-col group"
    >
      <div className="relative aspect-video bg-muted">
        {character.referenceUrl ? (
          <img
            src={character.referenceUrl}
            alt={character.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <Badge variant="secondary" className="text-[10px] capitalize bg-background/90">
            {catLabel}
          </Badge>
        </div>
      </div>
      <div className="p-3 flex flex-col flex-1">
        <h4 className="font-semibold text-sm truncate">{character.name}</h4>
        {character.description ? (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 flex-1">
            {character.description}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/60 mt-1 italic flex-1">No description</p>
        )}
        <div className="flex items-center gap-1 mt-3">
          <Button size="sm" variant="outline" onClick={onEdit} className="h-7 gap-1.5 text-xs">
            <Edit3 className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} className="h-7 text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={onUse} className="h-7 ml-auto gap-1.5 text-xs">
            <Clapperboard className="h-3.5 w-3.5" /> Use
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
