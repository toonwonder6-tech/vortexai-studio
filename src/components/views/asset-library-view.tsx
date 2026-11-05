"use client";
import { useEffect, useRef, useState } from "react";
import { PageHeader, SectionCard, EmptyState } from "@/components/shared";
import { api, formatBytes, timeAgo } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Image as ImageIcon, FolderOpen, Upload, Download, Trash2, Loader2, Film, Mic, Eye, Pencil, Check, X,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";

type AssetType = "image" | "video" | "audio";
type Tab = "all" | AssetType;

interface Asset {
  id: string;
  type: string;
  name: string;
  filename: string | null;
  mimeType: string | null;
  size: number;
  url: string;
  source: string | null;
  meta: string | null;
  createdAt: string;
  projectId: string | null;
}

export function AssetLibraryView() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Asset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Asset | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const r = await api<{ assets: Asset[] }>("/api/assets?limit=200");
      if (!cancelled) {
        if (r.ok && r.data) setAssets(r.data.assets);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function refresh(type: Tab = "all") {
    setLoading(true);
    const q = type === "all" ? "" : `?type=${type}&limit=200`;
    const r = await api<{ assets: Asset[] }>(`/api/assets${q || "?limit=200"}`);
    if (r.ok && r.data) setAssets(r.data.assets);
    setLoading(false);
  }

  function onTabChange(v: Tab) {
    setTab(v);
    refresh(v);
  }

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let okCount = 0;
    let failCount = 0;
    const total = files.length;
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", file.name);
      try {
        const res = await fetch("/api/assets", { method: "POST", body: fd });
        const json = await res.json();
        if (json.ok) {
          okCount++;
        } else {
          failCount++;
          toast.error(`"${file.name}" failed: ${json.error || "upload error"}`);
        }
      } catch {
        failCount++;
      }
    }
    setUploading(false);
    if (okCount > 0) {
      toast.success(`Uploaded ${okCount} of ${total} file${total === 1 ? "" : "s"}.`);
    }
    if (failCount === total) {
      // already toasted per file
    }
    await refresh(tab);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const r = await api(`/api/assets?id=${deleteTarget.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!r.ok) {
      toast.error(r.error || "Delete failed");
      return;
    }
    toast.success("Asset deleted.");
    setDeleteTarget(null);
    await refresh(tab);
  }

  function startRename(asset: Asset) {
    setRenameTarget(asset);
    setRenameValue(asset.name);
  }

  async function confirmRename() {
    if (!renameTarget || !renameValue.trim()) return;
    setRenaming(true);
    const r = await api(`/api/assets`, {
      method: "PATCH",
      body: JSON.stringify({ id: renameTarget.id, name: renameValue.trim() }),
    });
    setRenaming(false);
    if (!r.ok) {
      toast.error(r.error || "Rename failed");
      return;
    }
    toast.success("Renamed!");
    setAssets((prev) => prev.map((a) => (a.id === renameTarget.id ? { ...a, name: renameValue.trim() } : a)));
    setRenameTarget(null);
  }

  const counts = {
    all: assets.length,
    image: assets.filter((a) => a.type === "image").length,
    video: assets.filter((a) => a.type === "video").length,
    audio: assets.filter((a) => a.type === "audio").length,
  };

  return (
    <div>
      <PageHeader
        title="Asset Library"
        description="Every file you’ve uploaded or generated — images, videos and audio. Upload new media, preview, download and manage your studio assets."
        icon={<FolderOpen className="h-5 w-5" />}
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*"
              className="hidden"
              onChange={(e) => onUpload(e.target.files)}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="gap-2"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </>
        }
      />

      <SectionCard
        title="All assets"
        description={`${counts.all} asset${counts.all === 1 ? "" : "s"}`}
        actions={
          <Button variant="ghost" size="sm" onClick={() => refresh(tab)} className="gap-1.5">
            Refresh
          </Button>
        }
      >
        <Tabs value={tab} onValueChange={(v) => onTabChange(v as Tab)} className="mb-4">
          <TabsList>
            <TabsTrigger value="all" className="gap-1.5 text-xs">
              All <span className="text-muted-foreground">{counts.all}</span>
            </TabsTrigger>
            <TabsTrigger value="image" className="gap-1.5 text-xs">
              <ImageIcon className="h-3.5 w-3.5" /> Images <span className="text-muted-foreground">{counts.image}</span>
            </TabsTrigger>
            <TabsTrigger value="video" className="gap-1.5 text-xs">
              <Film className="h-3.5 w-3.5" /> Videos <span className="text-muted-foreground">{counts.video}</span>
            </TabsTrigger>
            <TabsTrigger value="audio" className="gap-1.5 text-xs">
              <Mic className="h-3.5 w-3.5" /> Audio <span className="text-muted-foreground">{counts.audio}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : assets.length === 0 ? (
          <EmptyState
            icon={<ImageIcon className="h-6 w-6" />}
            title="No assets yet"
            description="Upload images, videos or audio, or generate them with the studio tools to populate your library."
            action={
              <Button onClick={() => fileRef.current?.click()} className="gap-2">
                <Upload className="h-4 w-4" /> Upload first asset
              </Button>
            }
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[760px] overflow-y-auto scrollbar-thin pr-1">
            {assets.map((a, i) => (
              <AssetCard
                key={a.id}
                asset={a}
                index={i}
                onPreview={() => setPreview(a)}
                onDelete={() => setDeleteTarget(a)}
                onRename={() => startRename(a)}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          {preview && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate">{preview.name}</DialogTitle>
                <DialogDescription>
                  {formatBytes(preview.size)} · {preview.mimeType || preview.type} · {timeAgo(preview.createdAt)}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg overflow-hidden border bg-muted">
                {preview.type === "image" && (
                  <img src={preview.url} alt={preview.name} className="w-full h-auto max-h-[70vh] object-contain" />
                )}
                {preview.type === "video" && (
                  <video src={preview.url} controls className="w-full max-h-[70vh]" />
                )}
                {preview.type === "audio" && (
                  <div className="p-6 grid place-items-center">
                    <Mic className="h-10 w-10 text-muted-foreground mb-3" />
                    <audio src={preview.url} controls className="w-full" />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {preview.source || "upload"}
                </Badge>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { startRename(preview); setPreview(null); }} className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" /> Rename
                  </Button>
                  <Button size="sm" asChild className="gap-1.5">
                    <a href={preview.url} download={preview.name}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                  </Button>
                </div>
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
              The file will be permanently removed from your asset library.
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

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename asset</DialogTitle>
            <DialogDescription>Give this {renameTarget?.type || "asset"} a clear, memorable name.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Enter new name…"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && renameValue.trim()) confirmRename(); }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
              <Button onClick={confirmRename} disabled={renaming || !renameValue.trim()} className="gap-1.5">
                {renaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save name
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssetCard({
  asset, index, onPreview, onDelete, onRename,
}: {
  asset: Asset;
  index: number;
  onPreview: () => void;
  onDelete: () => void;
  onRename: () => void;
}) {
  const isGenerated = asset.source === "generated";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.3) }}
      className="rounded-lg border bg-card overflow-hidden group flex flex-col"
    >
      <button
        onClick={onPreview}
        className="relative w-full aspect-video bg-muted block overflow-hidden"
        aria-label={`Preview ${asset.name}`}
      >
        {asset.type === "image" && (
          <img src={asset.url} alt={asset.name} className="h-full w-full object-cover" />
        )}
        {asset.type === "video" && (
          <>
            <video src={asset.url} muted className="h-full w-full object-cover" />
            <div className="absolute inset-0 grid place-items-center bg-black/20">
              <span className="grid place-items-center h-9 w-9 rounded-full bg-background/90">
                <Film className="h-4 w-4" />
              </span>
            </div>
          </>
        )}
        {asset.type === "audio" && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="grid place-items-center h-12 w-12 rounded-full bg-primary/10 text-primary">
              <Mic className="h-5 w-5" />
            </div>
          </div>
        )}
        {asset.type !== "image" && asset.type !== "video" && asset.type !== "audio" && (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 grid place-items-center">
          <span className="grid place-items-center h-9 w-9 rounded-full bg-background/90">
            <Eye className="h-4 w-4" />
          </span>
        </div>
      </button>
      <div className="p-2.5 flex flex-col gap-1.5">
        <p className="text-xs font-medium truncate" title={asset.name}>{asset.name}</p>
        <div className="flex items-center justify-between gap-1.5">
          <Badge
            variant={isGenerated ? "default" : "secondary"}
            className="text-[10px] capitalize"
          >
            {asset.source || "upload"}
          </Badge>
          <span className="text-[10px] text-muted-foreground">{formatBytes(asset.size)}</span>
        </div>
        {asset.type === "audio" && (
          <audio src={asset.url} controls className="w-full h-8 mt-1" />
        )}
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-muted-foreground">{timeAgo(asset.createdAt)}</span>
          <div className="flex items-center gap-0.5">
            <a
              href={asset.url}
              download={asset.name}
              className="grid place-items-center h-7 w-7 rounded-md hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
              aria-label="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
            <button
              onClick={onRename}
              className="grid place-items-center h-7 w-7 rounded-md hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
              aria-label="Rename"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="grid place-items-center h-7 w-7 rounded-md hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
