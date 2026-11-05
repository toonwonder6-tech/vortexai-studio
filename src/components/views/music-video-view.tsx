"use client";
import { useEffect, useRef, useState } from "react";
import { PageHeader, SectionCard, EmptyState } from "@/components/shared";
import { api, fileToBase64, formatBytes, timeAgo } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Music, Music2, Upload, Wand2, Loader2, Film, Play, FileText, Download,
  Plus, Trash2, Save, Image as ImageIcon, Video, Clapperboard, AlertCircle,
  CheckCircle2, Clock, Mic2, Sparkles, ChevronRight, ListMusic, Settings2,
  Eye, RefreshCw, X, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Step = 1 | 2 | 3 | 4 | 5;

interface MusicVideoProject {
  id: string;
  name: string;
  mode: "montage" | "singing";
  songUrl: string | null;
  songName: string | null;
  songDuration: number | null;
  lyricsText: string | null;
  lipSyncSupported: boolean;
  scenes: Scene[];
  lyricLines: LyricLine[];
  _count?: { scenes: number; lyricLines: number };
  createdAt?: string;
  updatedAt?: string;
}

interface Scene {
  id: string;
  index: number;
  startTime: number;
  endTime: number;
  lyricText: string | null;
  characterName: string | null;
  visualPrompt: string | null;
  cameraDirection: string | null;
  videoUrl: string | null;
  videoStatus: "pending" | "generating" | "ready" | "failed";
  imageUrl: string | null;
  lipSyncStatus: "n/a" | "not-supported" | "synced" | "manual";
  error: string | null;
}

interface LyricLine {
  id: string;
  index: number;
  text: string;
  startTime: number | null;
  endTime: number | null;
  source: "manual" | "asr-estimate" | "imported-srt";
}

interface AudioAsset {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

interface AnalyzeResult {
  duration: number;
  transcript: string;
  lyricLines: LyricLine[];
  silences: any[];
  timingNote: string;
}

interface RenderResult {
  asset: { id: string; url: string; name: string };
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const STEPS: { id: Step; label: string; icon: typeof Music }[] = [
  { id: 1, label: "Upload Song", icon: Music2 },
  { id: 2, label: "Analyze Song", icon: Mic2 },
  { id: 3, label: "Edit Lyrics", icon: ListMusic },
  { id: 4, label: "Plan Scenes", icon: Clapperboard },
  { id: 5, label: "Preview & Export", icon: Film },
];

const RESOLUTIONS = [
  { label: "720p Landscape (1280×720)", value: "1280x720", w: 1280, h: 720 },
  { label: "1080p Landscape (1920×1080)", value: "1920x1080", w: 1920, h: 1080 },
  { label: "Square (1024×1024)", value: "1024x1024", w: 1024, h: 1024 },
  { label: "Vertical (720×1280)", value: "720x1280", w: 720, h: 1280 },
];

const TRANSITIONS = [
  { value: "none", label: "None (hard cut)" },
  { value: "fade", label: "Fade" },
  { value: "dissolve", label: "Dissolve" },
  { value: "slideleft", label: "Slide Left" },
  { value: "slideright", label: "Slide Right" },
  { value: "slideup", label: "Slide Up" },
  { value: "slidedown", label: "Slide Down" },
  { value: "wipeleft", label: "Wipe Left" },
];

const LYRIC_COLORS = [
  { label: "White", value: "white" },
  { label: "Yellow", value: "yellow" },
  { label: "Cyan", value: "cyan" },
  { label: "Pink", value: "pink" },
  { label: "Black", value: "black" },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDuration(sec: number | null | undefined): string {
  if (sec == null || isNaN(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSeconds(sec: number | null | undefined): string {
  if (sec == null || isNaN(sec)) return "—";
  return `${sec.toFixed(1)}s`;
}

function triggerDownload(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function MusicVideoView() {
  const { setView } = useApp();

  const [step, setStep] = useState<Step>(1);
  const [projects, setProjects] = useState<MusicVideoProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [current, setCurrent] = useState<MusicVideoProject | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);

  // New project dialog
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMode, setNewMode] = useState<"montage" | "singing">("montage");
  const [newSongUrl, setNewSongUrl] = useState<string | null>(null);
  const [newSongName, setNewSongName] = useState<string>("");
  const [audioAssets, setAudioAssets] = useState<AudioAsset[]>([]);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [uploadingSong, setUploadingSong] = useState(false);
  const [songSource, setSongSource] = useState<"upload" | "existing">("upload");
  const [creating, setCreating] = useState(false);
  const fileSongRef = useRef<HTMLInputElement>(null);

  // Step 2: analyze
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);

  // Step 3: lyrics
  const [lyricLines, setLyricLines] = useState<LyricLine[]>([]);
  const [savingLyrics, setSavingLyrics] = useState(false);
  const [srtDialogOpen, setSrtDialogOpen] = useState(false);
  const [srtContent, setSrtContent] = useState("");
  const [importingSrt, setImportingSrt] = useState(false);

  // Step 4: scenes
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [planning, setPlanning] = useState(false);
  const [savingScenes, setSavingScenes] = useState(false);
  const [sceneBusy, setSceneBusy] = useState<Record<string, { kind: "image" | "video" | "upload"; progress: number } | null>>({});
  const pollersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Step 5: render
  const [resolution, setResolution] = useState("1280x720");
  const [fps, setFps] = useState(30);
  const [transition, setTransition] = useState("fade");
  const [lyricOverlay, setLyricOverlay] = useState(true);
  const [lyricFontSize, setLyricFontSize] = useState(28);
  const [lyricColor, setLyricColor] = useState("white");
  const [excerptStart, setExcerptStart] = useState<string>("");
  const [excerptEnd, setExcerptEnd] = useState<string>("");
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);

  /* -------------------- initial project list -------------------- */
  useEffect(() => {
    refreshProjects();
  }, []);

  async function refreshProjects() {
    setLoadingProjects(true);
    const r = await api<{ projects: MusicVideoProject[] }>("/api/music-video/list");
    setLoadingProjects(false);
    if (r.ok && r.data?.projects) {
      setProjects(r.data.projects);
    } else if (!r.ok) {
      toast.error(r.error || "Could not load music video projects.");
    }
  }

  /* -------------------- open new project dialog -------------------- */
  function openNewDialog() {
    setNewName("");
    setNewMode("montage");
    setNewSongUrl(null);
    setNewSongName("");
    setSongSource("upload");
    setSrtContent("");
    setNewDialogOpen(true);
    // Load existing audio assets
    setLoadingAudio(true);
    api<{ assets: AudioAsset[] }>("/api/assets?type=audio&limit=50").then((r) => {
      setLoadingAudio(false);
      if (r.ok && r.data?.assets) setAudioAssets(r.data.assets);
    });
  }

  async function onUploadSong(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    setUploadingSong(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("name", f.name);
      const res = await fetch("/api/assets", { method: "POST", body: fd });
      const json = await res.json();
      if (json.ok) {
        setNewSongUrl(json.data.asset.url);
        setNewSongName(f.name);
        toast.success("Song uploaded.");
      } else {
        toast.error(json.error || "Upload failed.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Upload failed.");
    } finally {
      setUploadingSong(false);
    }
  }

  /* -------------------- create project -------------------- */
  async function createProject() {
    if (!newName.trim()) {
      toast.error("Please enter a project name.");
      return;
    }
    if (!newSongUrl) {
      toast.error("Please upload or select a song.");
      return;
    }
    setCreating(true);
    const r = await api<{ project: any; mvProject: MusicVideoProject }>("/api/music-video/create", {
      method: "POST",
      body: JSON.stringify({ name: newName.trim(), songUrl: newSongUrl, songName: newSongName || null, mode: newMode }),
    });
    setCreating(false);
    if (!r.ok || !r.data?.mvProject) {
      toast.error(r.error || "Could not create project.");
      return;
    }
    toast.success("Music video project created.");
    setNewDialogOpen(false);
    await refreshProjects();
    await loadProject(r.data.mvProject.id);
    setStep(2);
  }

  /* -------------------- load a project (full) -------------------- */
  async function loadProject(id: string) {
    setLoadingProject(true);
    setAnalyzeResult(null);
    setRenderResult(null);
    const r = await api<{ mvProject: MusicVideoProject }>(`/api/music-video/get?id=${encodeURIComponent(id)}`);
    setLoadingProject(false);
    if (!r.ok || !r.data?.mvProject) {
      toast.error(r.error || "Could not load project.");
      return;
    }
    const mv = r.data.mvProject;
    setCurrent(mv);
    setLyricLines(mv.lyricLines || []);
    setScenes(mv.scenes || []);
    // Reset render excerpt placeholders based on song duration
    setExcerptStart("");
    setExcerptEnd(mv.songDuration ? String(mv.songDuration.toFixed(1)) : "");
    setRenderResult(null);
  }

  function openProject(p: MusicVideoProject) {
    loadProject(p.id).then(() => {
      // Decide which step to land on based on what's filled
      if ((p._count?.scenes || 0) > 0) setStep(4);
      else if ((p._count?.lyricLines || 0) > 0) setStep(3);
      else if (p.songDuration) setStep(2);
      else setStep(2);
    });
  }

  /* -------------------- step 2: analyze -------------------- */
  async function analyzeSong() {
    if (!current) return;
    setAnalyzing(true);
    setAnalyzeResult(null);
    toast.info("Analyzing song — transcribing lyrics and detecting timing…");
    const r = await api<AnalyzeResult>("/api/music-video/analyze", {
      method: "POST",
      body: JSON.stringify({ mvProjectId: current.id }),
    });
    setAnalyzing(false);
    if (!r.ok || !r.data) {
      toast.error(r.error || "Analysis failed.");
      return;
    }
    setAnalyzeResult(r.data);
    // Refresh the project (duration may have been updated) + lyric lines
    await loadProject(current.id);
    toast.success("Analysis complete. Review the lyrics and timings below.");
  }

  /* -------------------- step 3: lyric helpers -------------------- */
  function updateLyricLine(id: string, patch: Partial<LyricLine>) {
    setLyricLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function addLyricLine() {
    const nextIdx = lyricLines.length;
    setLyricLines((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${nextIdx}`,
        index: nextIdx,
        text: "",
        startTime: null,
        endTime: null,
        source: "manual",
      },
    ]);
  }

  function deleteLyricLine(id: string) {
    setLyricLines((prev) => prev.filter((l) => l.id !== id).map((l, i) => ({ ...l, index: i })));
  }

  async function saveLyrics() {
    if (!current) return;
    setSavingLyrics(true);
    const lines = lyricLines.map((l, i) => ({
      index: i,
      text: l.text,
      startTime: l.startTime,
      endTime: l.endTime,
      source: l.source,
    }));
    const r = await api<{ lyricLines: LyricLine[] }>("/api/music-video/lyrics", {
      method: "POST",
      body: JSON.stringify({ mvProjectId: current.id, action: "update-lines", lines }),
    });
    setSavingLyrics(false);
    if (r.ok && r.data?.lyricLines) {
      setLyricLines(r.data.lyricLines);
      toast.success("Lyrics saved.");
    } else {
      toast.error(r.error || "Could not save lyrics.");
    }
  }

  async function importSrt() {
    if (!current) return;
    if (!srtContent.trim()) {
      toast.error("Paste SRT content first.");
      return;
    }
    setImportingSrt(true);
    const r = await api<{ lyricLines: LyricLine[] }>("/api/music-video/lyrics", {
      method: "POST",
      body: JSON.stringify({ mvProjectId: current.id, action: "import-srt", srt: srtContent }),
    });
    setImportingSrt(false);
    if (r.ok && r.data?.lyricLines) {
      setLyricLines(r.data.lyricLines);
      toast.success(`Imported ${r.data.lyricLines.length} lyric lines from SRT.`);
      setSrtDialogOpen(false);
      setSrtContent("");
    } else {
      toast.error(r.error || "Could not import SRT.");
    }
  }

  async function exportSrt() {
    if (!current) return;
    const r = await api<{ srt: string }>(`/api/music-video/lyrics?mvProjectId=${encodeURIComponent(current.id)}&format=srt`);
    if (r.ok && r.data?.srt != null) {
      triggerDownload(`${current.name.replace(/\s+/g, "_")}.srt`, r.data.srt, "application/x-subrip");
      toast.success("SRT downloaded.");
    } else {
      toast.error(r.error || "Could not export SRT.");
    }
  }

  /* -------------------- step 4: scene helpers -------------------- */
  function updateScene(id: string, patch: Partial<Scene>) {
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function planScenes() {
    if (!current) return;
    if (!current.songDuration) {
      toast.error("Analyze the song first so we know its duration.");
      return;
    }
    setPlanning(true);
    toast.info("AI is planning scenes based on your lyrics and song duration…");
    const r = await api<{ scenes: Scene[] }>("/api/music-video/scenes", {
      method: "POST",
      body: JSON.stringify({ mvProjectId: current.id, action: "plan" }),
    });
    setPlanning(false);
    if (r.ok && r.data?.scenes) {
      setScenes(r.data.scenes);
      toast.success(`Planned ${r.data.scenes.length} scenes. Review and generate visuals.`);
    } else {
      toast.error(r.error || "Could not plan scenes.");
    }
  }

  async function saveScenes() {
    if (!current) return;
    setSavingScenes(true);
    let ok = 0;
    let fail = 0;
    await Promise.all(
      scenes.map((s) =>
        api("/api/music-video/scenes", {
          method: "POST",
          body: JSON.stringify({
            mvProjectId: current.id,
            action: "update",
            sceneId: s.id,
            startTime: s.startTime,
            endTime: s.endTime,
            lyricText: s.lyricText,
            visualPrompt: s.visualPrompt,
            cameraDirection: s.cameraDirection,
            characterName: s.characterName,
          }),
        }).then((r) => (r.ok ? ok++ : fail++)),
      ),
    );
    setSavingScenes(false);
    if (fail === 0) toast.success(`Saved ${ok} scene(s).`);
    else toast.warning(`Saved ${ok}, ${fail} failed.`);
  }

  async function deleteScene(id: string) {
    if (!current) return;
    const r = await api("/api/music-video/scenes", {
      method: "POST",
      body: JSON.stringify({ mvProjectId: current.id, action: "delete", sceneId: id }),
    });
    if (r.ok) {
      setScenes((prev) => prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, index: i })));
      toast.success("Scene deleted.");
    } else {
      toast.error(r.error || "Could not delete scene.");
    }
  }

  async function generateSceneImage(sceneId: string) {
    if (!current) return;
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    if (!scene.visualPrompt || !scene.visualPrompt.trim()) {
      toast.error("Add a visual prompt first.");
      return;
    }
    setSceneBusy((p) => ({ ...p, [sceneId]: { kind: "image", progress: 30 } }));
    toast.info("Generating storyboard image…");
    const r = await api<{ scene: Scene }>("/api/music-video/scenes", {
      method: "POST",
      body: JSON.stringify({ mvProjectId: current.id, action: "generate-image", sceneId }),
    });
    setSceneBusy((p) => ({ ...p, [sceneId]: null }));
    if (r.ok && r.data?.scene) {
      updateScene(sceneId, { imageUrl: r.data.scene.imageUrl });
      toast.success("Storyboard image generated.");
    } else {
      toast.error(r.error || "Could not generate image.");
    }
  }

  async function generateSceneVideo(sceneId: string) {
    if (!current) return;
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    if (!scene.visualPrompt || !scene.visualPrompt.trim()) {
      toast.error("Add a visual prompt first.");
      return;
    }
    // Stop any existing poller for this scene
    if (pollersRef.current[sceneId]) {
      clearInterval(pollersRef.current[sceneId]);
      delete pollersRef.current[sceneId];
    }
    setSceneBusy((p) => ({ ...p, [sceneId]: { kind: "video", progress: 5 } }));
    updateScene(sceneId, { videoStatus: "generating", error: null });
    toast.info(`Submitting scene ${scene.index + 1} to Z.ai video engine…`);

    const submitR = await api<{ job: any }>("/api/ai/video", {
      method: "POST",
      body: JSON.stringify({
        prompt: scene.visualPrompt,
        imageUrls: scene.imageUrl ? [scene.imageUrl] : [],
        withAudio: false,
        name: `Scene ${scene.index + 1} — ${current.name}`,
      }),
    });
    if (!submitR.ok || !submitR.data?.job?.id) {
      setSceneBusy((p) => ({ ...p, [sceneId]: null }));
      updateScene(sceneId, { videoStatus: "failed", error: submitR.error || "Submit failed" });
      toast.error(submitR.error || "Could not submit video generation.");
      return;
    }
    const jobId = submitR.data.job.id as string;
    toast.success("Scene queued — polling for completion…");

    // Poll
    let tries = 0;
    pollersRef.current[sceneId] = setInterval(async () => {
      tries++;
      const pr = await api<{ job: any }>(`/api/ai/video?id=${encodeURIComponent(jobId)}`);
      if (!pr.ok) {
        if (tries > 150) {
          clearInterval(pollersRef.current[sceneId]);
          delete pollersRef.current[sceneId];
          setSceneBusy((p) => ({ ...p, [sceneId]: null }));
          updateScene(sceneId, { videoStatus: "failed", error: "Polling timed out." });
        }
        return;
      }
      const job = pr.data?.job;
      if (!job) return;
      const pct = typeof job.progress === "number" ? job.progress : 10;
      setSceneBusy((p) => ({ ...p, [sceneId]: { kind: "video", progress: Math.max(10, pct) } }));
      if (job.status === "completed" && job.resultUrl) {
        clearInterval(pollersRef.current[sceneId]);
        delete pollersRef.current[sceneId];
        // Persist to the scene
        const upd = await api<{ scene: Scene }>("/api/music-video/scenes", {
          method: "POST",
          body: JSON.stringify({ mvProjectId: current.id, action: "update", sceneId, videoUrl: job.resultUrl }),
        });
        setSceneBusy((p) => ({ ...p, [sceneId]: null }));
        if (upd.ok) {
          updateScene(sceneId, { videoUrl: job.resultUrl, videoStatus: "ready", error: null });
          toast.success(`Scene ${scene.index + 1} video ready.`);
        } else {
          updateScene(sceneId, { videoStatus: "failed", error: upd.error || "Could not save video URL." });
          toast.error(upd.error || "Could not save video URL.");
        }
      } else if (job.status === "failed" || job.status === "expired") {
        clearInterval(pollersRef.current[sceneId]);
        delete pollersRef.current[sceneId];
        setSceneBusy((p) => ({ ...p, [sceneId]: null }));
        updateScene(sceneId, { videoStatus: "failed", error: job.error || "Generation failed." });
        toast.error(job.error || `Scene ${scene.index + 1} generation failed.`);
      }
      if (tries > 180) {
        clearInterval(pollersRef.current[sceneId]);
        delete pollersRef.current[sceneId];
        setSceneBusy((p) => ({ ...p, [sceneId]: null }));
      }
    }, 5000);
  }

  async function uploadSceneVideo(sceneId: string, files: FileList | null) {
    if (!current || !files || files.length === 0) return;
    const f = files[0];
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    setSceneBusy((p) => ({ ...p, [sceneId]: { kind: "upload", progress: 50 } }));
    updateScene(sceneId, { videoStatus: "generating", error: null });
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("name", `Scene ${scene.index + 1} upload`);
      const res = await fetch("/api/assets", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) {
        setSceneBusy((p) => ({ ...p, [sceneId]: null }));
        updateScene(sceneId, { videoStatus: "failed", error: json.error || "Upload failed." });
        toast.error(json.error || "Upload failed.");
        return;
      }
      const url = json.data.asset.url as string;
      const upd = await api<{ scene: Scene }>("/api/music-video/scenes", {
        method: "POST",
        body: JSON.stringify({ mvProjectId: current.id, action: "update", sceneId, videoUrl: url }),
      });
      setSceneBusy((p) => ({ ...p, [sceneId]: null }));
      if (upd.ok) {
        updateScene(sceneId, { videoUrl: url, videoStatus: "ready", error: null });
        toast.success(`Scene ${scene.index + 1} video uploaded.`);
      } else {
        updateScene(sceneId, { videoStatus: "failed", error: upd.error || "Could not save." });
        toast.error(upd.error || "Could not save video URL.");
      }
    } catch (e: any) {
      setSceneBusy((p) => ({ ...p, [sceneId]: null }));
      updateScene(sceneId, { videoStatus: "failed", error: e?.message || "Upload failed." });
      toast.error(e?.message || "Upload failed.");
    }
  }

  /* -------------------- step 5: render -------------------- */
  async function renderMusicVideo() {
    if (!current) return;
    const res = RESOLUTIONS.find((r) => r.value === resolution) || RESOLUTIONS[0];
    const body: any = {
      mvProjectId: current.id,
      name: `${current.name} — Music Video`,
      resolution: { w: res.w, h: res.h },
      fps,
      transition,
      transitionDuration: transition === "none" ? 0 : 0.5,
      lyricOverlay,
      lyricFontSize,
      lyricColor,
    };
    const start = parseFloat(excerptStart);
    const end = parseFloat(excerptEnd);
    if (!isNaN(start) && start >= 0) body.excerptStart = start;
    if (!isNaN(end) && end > 0) body.excerptEnd = end;

    setRendering(true);
    setRenderProgress(8);
    setRenderResult(null);
    toast.info("Rendering music video — this can take a minute or two…");
    // Simulate gentle progress while the (long) render call is in flight.
    const progTimer = setInterval(() => {
      setRenderProgress((p) => (p < 90 ? p + 2 : p));
    }, 1500);

    const r = await api<RenderResult>("/api/music-video/render", {
      method: "POST",
      body: JSON.stringify(body),
    });
    clearInterval(progTimer);
    setRendering(false);
    if (r.ok && r.data?.asset) {
      setRenderProgress(100);
      setRenderResult(r.data);
      toast.success("Music video rendered!");
    } else {
      setRenderProgress(0);
      toast.error(r.error || "Render failed.");
    }
  }

  /* -------------------- derived -------------------- */
  const scenesWithVideo = scenes.filter((s) => !!s.videoUrl);
  const sceneCoverage = scenesWithVideo.reduce((sum, s) => sum + (s.endTime - s.startTime), 0);
  const songDuration = current?.songDuration || 0;
  const coveragePct = songDuration > 0 ? Math.min(100, Math.round((sceneCoverage / songDuration) * 100)) : 0;
  const hasDurationGap = songDuration > 0 && sceneCoverage < songDuration * 0.95;

  const resolvedRes = RESOLUTIONS.find((r) => r.value === resolution) || RESOLUTIONS[0];

  /* -------------------- step can-advance helpers -------------------- */
  function canGoTo(target: Step): boolean {
    if (!current) return target === 1;
    if (target === 1) return true;
    if (target === 2) return !!current.songUrl;
    if (target === 3) return !!current.songUrl;
    if (target === 4) return lyricLines.length > 0 || scenes.length > 0 || !!current.songDuration;
    if (target === 5) return scenes.length > 0;
    return false;
  }

  function goToStep(target: Step) {
    if (!canGoTo(target)) {
      toast.error("Complete the previous steps first.");
      return;
    }
    setStep(target);
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <div>
      <PageHeader
        title="Music Video Studio"
        description="Turn any song into a cinematic music video: upload, transcribe lyrics, plan scenes, and render a final cut — powered by Z.ai."
        icon={<Music className="h-5 w-5" />}
        actions={
          <Button variant="outline" onClick={() => setView("video-generator")} className="gap-2">
            <Clapperboard className="h-4 w-4" /> Video Generator
          </Button>
        }
      />

      <div className="grid lg:grid-cols-[280px_1fr] gap-6">
        {/* ============ LEFT: stepper + project summary ============ */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <SectionCard title="Workflow">
            <ol className="space-y-1">
              {STEPS.map((s, i) => {
                const completed = step > s.id;
                const currentStep = step === s.id;
                const reachable = canGoTo(s.id);
                const Icon = s.icon;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={!reachable}
                      onClick={() => goToStep(s.id)}
                      className={[
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all",
                        currentStep
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : completed
                          ? "bg-primary/10 text-primary hover:bg-primary/15"
                          : reachable
                          ? "text-muted-foreground hover:bg-accent/40"
                          : "text-muted-foreground/50 cursor-not-allowed",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "grid place-items-center h-6 w-6 rounded-full text-xs font-bold shrink-0",
                          currentStep
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : completed
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        ].join(" ")}
                      >
                        {completed ? <CheckCircle2 className="h-4 w-4" /> : s.id}
                      </span>
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-medium truncate">{s.label}</span>
                    </button>
                    {i < STEPS.length - 1 && (
                      <div className="ml-[1.4rem] h-2 w-px bg-border" aria-hidden />
                    )}
                  </li>
                );
              })}
            </ol>
          </SectionCard>

          {current && (
            <SectionCard title="Current project">
              <div className="space-y-2.5 text-sm">
                <div>
                  <p className="font-semibold leading-tight">{current.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Updated {timeAgo(current.updatedAt || current.createdAt || new Date())}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={current.mode === "singing" ? "default" : "secondary"} className="text-[10px]">
                    {current.mode === "singing" ? "Singing" : "Montage"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">{formatDuration(current.songDuration)}</Badge>
                  <Badge variant="outline" className="text-[10px]">{scenes.length} scenes</Badge>
                  <Badge variant="outline" className="text-[10px]">{lyricLines.length} lyrics</Badge>
                </div>
                {current.songUrl && (
                  <audio controls src={current.songUrl} className="w-full h-9 mt-1" preload="metadata" />
                )}
                {current.mode === "singing" && (
                  <div className="mt-2 p-2 rounded-md bg-red-500/10 border border-red-500/30 text-[11px] text-red-500 leading-snug">
                    Lip-sync <strong>not supported</strong> — Z.ai cogvideox cannot animate mouths to vocals.
                  </div>
                )}
                <Button variant="ghost" size="sm" className="w-full mt-1 gap-1.5 text-xs" onClick={() => { setCurrent(null); setStep(1); refreshProjects(); }}>
                  <RefreshCw className="h-3.5 w-3.5" /> Switch project
                </Button>
              </div>
            </SectionCard>
          )}
        </aside>

        {/* ============ RIGHT: step content ============ */}
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            {/* ============ STEP 1 — UPLOAD SONG ============ */}
            {step === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
              >
                <SectionCard
                  title="Your music video projects"
                  description="Pick up where you left off, or start a new music video."
                  actions={
                    <Button onClick={openNewDialog} className="gap-2">
                      <Plus className="h-4 w-4" /> New Music Video
                    </Button>
                  }
                >
                  {loadingProjects ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading projects…
                    </div>
                  ) : projects.length === 0 ? (
                    <EmptyState
                      icon={<Music2 className="h-6 w-6" />}
                      title="No music videos yet"
                      description="Start your first music video project — upload a song and let AI plan the visuals."
                      action={
                        <Button onClick={openNewDialog} className="gap-2">
                          <Plus className="h-4 w-4" /> New Music Video
                        </Button>
                      }
                    />
                  ) : (
                    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[640px] overflow-y-auto scrollbar-thin pr-1">
                      {projects.map((p) => (
                        <ProjectCard key={p.id} project={p} onOpen={() => openProject(p)} />
                      ))}
                    </div>
                  )}
                </SectionCard>
              </motion.div>
            )}

            {/* ============ STEP 2 — ANALYZE SONG ============ */}
            {step === 2 && current && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <SectionCard
                  title="Analyze the song"
                  description="Z.ai ASR transcribes the audio. Silence detection runs in parallel."
                  actions={
                    <Button onClick={analyzeSong} disabled={analyzing} className="gap-2">
                      {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                      {analyzing ? "Analyzing…" : "Analyze Song"}
                    </Button>
                  }
                >
                  {loadingProject ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading project…
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid sm:grid-cols-3 gap-3">
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Song</p>
                          <p className="font-medium truncate mt-1">{current.songName || "Untitled"}</p>
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Duration</p>
                          <p className="font-medium mt-1">{formatDuration(current.songDuration)}</p>
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Mode</p>
                          <p className="font-medium mt-1 capitalize">{current.mode}</p>
                        </div>
                      </div>

                      {current.songUrl && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Song preview</Label>
                          <audio controls src={current.songUrl} className="w-full mt-1.5" preload="metadata" />
                        </div>
                      )}

                      {analyzing && (
                        <div className="flex items-center gap-3 p-4 rounded-lg border border-primary/20 bg-primary/5">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          <div>
                            <p className="text-sm font-medium">Analyzing song — transcribing lyrics and detecting timing…</p>
                            <p className="text-xs text-muted-foreground mt-0.5">This runs Z.ai ASR + FFmpeg silence detection. May take 10-30 seconds.</p>
                          </div>
                        </div>
                      )}

                      {analyzeResult && (
                        <div className="space-y-3">
                          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                            <strong>HONESTY NOTE:</strong> Z.ai ASR provides plain text only — no word-level timestamps. Timings below are <strong>ESTIMATED by even distribution</strong> and must be reviewed manually.
                          </div>

                          {analyzeResult.transcript ? (
                            <div className="space-y-2">
                              <Label className="text-xs">Transcript (read-only)</Label>
                              <Textarea
                                rows={6}
                                value={analyzeResult.transcript}
                                readOnly
                                className="text-xs font-mono bg-muted/30"
                              />
                              <p className="text-xs text-muted-foreground">
                                {analyzeResult.lyricLines?.length || 0} lyric lines extracted with estimated timings.
                              </p>
                            </div>
                          ) : (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500 leading-relaxed">
                              ASR could not transcribe this audio (it&apos;s optimized for speech, not music). Please paste lyrics manually in Step 3.
                            </div>
                          )}

                          <p className="text-xs italic text-muted-foreground">{analyzeResult.timingNote}</p>
                        </div>
                      )}

                      <div className="flex justify-end pt-2">
                        <Button onClick={() => setStep(3)} className="gap-2">
                          Edit Lyrics <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </SectionCard>
              </motion.div>
            )}

            {/* ============ STEP 3 — EDIT LYRICS ============ */}
            {step === 3 && current && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <SectionCard
                  title="Lyric editor"
                  description="Edit text and timings. Lines marked 'asr-estimate' need manual review."
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSrtDialogOpen(true)} className="gap-1.5 text-xs h-8">
                        <Upload className="h-3.5 w-3.5" /> Import SRT
                      </Button>
                      <Button variant="outline" size="sm" onClick={exportSrt} className="gap-1.5 text-xs h-8">
                        <Download className="h-3.5 w-3.5" /> Export SRT
                      </Button>
                      <Button size="sm" onClick={saveLyrics} disabled={savingLyrics} className="gap-1.5 text-xs h-8">
                        {savingLyrics ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        {savingLyrics ? "Saving…" : "Save lyrics"}
                      </Button>
                    </div>
                  }
                >
                  {lyricLines.length === 0 ? (
                    <EmptyState
                      icon={<ListMusic className="h-6 w-6" />}
                      title="No lyrics yet"
                      description="Analyze the song, paste lyrics manually, or import an SRT file to get started."
                      action={
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => setStep(2)} className="gap-1.5">
                            <Mic2 className="h-4 w-4" /> Analyze song
                          </Button>
                          <Button size="sm" onClick={addLyricLine} className="gap-1.5">
                            <Plus className="h-4 w-4" /> Add line
                          </Button>
                        </div>
                      }
                    />
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={addLyricLine} className="gap-1.5 text-xs h-8">
                          <Plus className="h-3.5 w-3.5" /> Add line
                        </Button>
                      </div>
                      <div className="max-h-[560px] overflow-y-auto scrollbar-thin pr-1 space-y-2">
                        {lyricLines.map((line, i) => (
                          <LyricRow
                            key={line.id}
                            line={line}
                            index={i}
                            onChange={(patch) => updateLyricLine(line.id, patch)}
                            onDelete={() => deleteLyricLine(line.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between pt-3 mt-3 border-t">
                    <Button variant="ghost" onClick={() => setStep(2)} className="gap-1.5 text-sm">
                      <ChevronRight className="h-4 w-4 rotate-180" /> Back
                    </Button>
                    <Button onClick={() => setStep(4)} className="gap-2">
                      Plan Scenes <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </SectionCard>
              </motion.div>
            )}

            {/* ============ STEP 4 — PLAN SCENES ============ */}
            {step === 4 && current && (
              <motion.div
                key="step-4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <SectionCard
                  title="Scene planner"
                  description="AI splits the song into 8-second scenes. Generate an image, then a video per scene."
                  actions={
                    <div className="flex flex-wrap gap-2">
                      {scenes.length > 0 && (
                        <Button variant="outline" size="sm" onClick={saveScenes} disabled={savingScenes} className="gap-1.5 text-xs h-8">
                          {savingScenes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          {savingScenes ? "Saving…" : "Save changes"}
                        </Button>
                      )}
                      <Button size="sm" onClick={planScenes} disabled={planning} className="gap-1.5 text-xs h-8">
                        {planning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {planning ? "Planning…" : scenes.length ? "Re-plan" : "Auto-generate scenes"}
                      </Button>
                    </div>
                  }
                >
                  {planning ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">AI is planning scenes based on your lyrics and song duration…</p>
                    </div>
                  ) : scenes.length === 0 ? (
                    <EmptyState
                      icon={<Clapperboard className="h-6 w-6" />}
                      title="No scenes yet"
                      description="Click 'Auto-generate scenes' to let the AI divide your song into 8-second segments with visual prompts."
                      action={
                        <Button onClick={planScenes} disabled={planning} className="gap-2">
                          <Sparkles className="h-4 w-4" /> Auto-generate scenes
                        </Button>
                      }
                    />
                  ) : (
                    <div className="space-y-3 max-h-[700px] overflow-y-auto scrollbar-thin pr-1">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="rounded-md border bg-muted/30 p-2">
                          <p className="text-muted-foreground">Scenes</p>
                          <p className="font-bold text-base">{scenes.length}</p>
                        </div>
                        <div className="rounded-md border bg-muted/30 p-2">
                          <p className="text-muted-foreground">With video</p>
                          <p className="font-bold text-base text-emerald-500">{scenesWithVideo.length}</p>
                        </div>
                        <div className="rounded-md border bg-muted/30 p-2">
                          <p className="text-muted-foreground">Coverage</p>
                          <p className="font-bold text-base">{coveragePct}%</p>
                        </div>
                        <div className="rounded-md border bg-muted/30 p-2">
                          <p className="text-muted-foreground">Song</p>
                          <p className="font-bold text-base">{formatDuration(songDuration)}</p>
                        </div>
                      </div>

                      {current.mode === "singing" && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500 leading-relaxed">
                          <strong>Lip-sync NOT SUPPORTED</strong> — Z.ai cogvideox does not support audio-conditioned mouth animation. Singing Characters mode will produce a music montage with characters present, but their mouths will <strong>not</strong> sync to vocals.
                        </div>
                      )}

                      {scenes.map((scene) => (
                        <SceneCard
                          key={scene.id}
                          scene={scene}
                          mode={current.mode}
                          busy={sceneBusy[scene.id] || null}
                          onGenerateImage={() => generateSceneImage(scene.id)}
                          onGenerateVideo={() => generateSceneVideo(scene.id)}
                          onUploadVideo={(files) => uploadSceneVideo(scene.id, files)}
                          onUpdate={(patch) => updateScene(scene.id, patch)}
                          onDelete={() => deleteScene(scene.id)}
                        />
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between pt-3 mt-3 border-t">
                    <Button variant="ghost" onClick={() => setStep(3)} className="gap-1.5 text-sm">
                      <ChevronRight className="h-4 w-4 rotate-180" /> Back
                    </Button>
                    <Button onClick={() => setStep(5)} disabled={scenes.length === 0} className="gap-2">
                      Preview & Export <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </SectionCard>
              </motion.div>
            )}

            {/* ============ STEP 5 — PREVIEW & EXPORT ============ */}
            {step === 5 && current && (
              <motion.div
                key="step-5"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <SectionCard
                  title="Preview & render"
                  description="Configure output options and render the final music video."
                >
                  {/* Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-4">
                    <div className="rounded-md border bg-muted/30 p-3">
                      <p className="text-muted-foreground">Song duration</p>
                      <p className="font-bold text-lg">{formatDuration(songDuration)}</p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-3">
                      <p className="text-muted-foreground">Total scenes</p>
                      <p className="font-bold text-lg">{scenes.length}</p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-3">
                      <p className="text-muted-foreground">With video</p>
                      <p className="font-bold text-lg text-emerald-500">{scenesWithVideo.length}</p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-3">
                      <p className="text-muted-foreground">Missing</p>
                      <p className="font-bold text-lg text-red-500">{scenes.length - scenesWithVideo.length}</p>
                    </div>
                  </div>

                  {/* Duration mismatch warning */}
                  {hasDurationGap && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/40 text-sm text-red-600 dark:text-red-400 mb-4">
                      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Duration mismatch</p>
                        <p className="text-xs mt-0.5">
                          Your scenes cover only <strong>{sceneCoverage.toFixed(1)}s</strong> of a <strong>{songDuration.toFixed(1)}s</strong> song. The final video will have gaps. Generate more clips or upload videos for missing scenes.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Options */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Resolution</Label>
                      <Select value={resolution} onValueChange={setResolution}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RESOLUTIONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Frame rate</Label>
                      <Select value={String(fps)} onValueChange={(v) => setFps(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[24, 30, 60].map((f) => <SelectItem key={f} value={String(f)}>{f} fps</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Transition</Label>
                      <Select value={transition} onValueChange={setTransition}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TRANSITIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Lyric overlay</Label>
                      <div className="flex items-center gap-2 h-9">
                        <Switch checked={lyricOverlay} onCheckedChange={setLyricOverlay} id="lyric-overlay" />
                        <Label htmlFor="lyric-overlay" className="text-xs text-muted-foreground cursor-pointer">
                          {lyricOverlay ? "Burn in subtitles" : "No subtitles"}
                        </Label>
                      </div>
                    </div>
                    {lyricOverlay && (
                      <>
                        <div className="space-y-2">
                          <Label>Lyric font size: <span className="text-primary font-mono">{lyricFontSize}px</span></Label>
                          <Slider value={[lyricFontSize]} min={14} max={64} step={2} onValueChange={(v) => setLyricFontSize(v[0])} />
                        </div>
                        <div className="space-y-2">
                          <Label>Lyric color</Label>
                          <Select value={lyricColor} onValueChange={setLyricColor}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {LYRIC_COLORS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                    <div className="space-y-2">
                      <Label>Excerpt start (seconds, optional)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={excerptStart}
                        onChange={(e) => setExcerptStart(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Excerpt end (seconds, optional)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={excerptEnd}
                        onChange={(e) => setExcerptEnd(e.target.value)}
                        placeholder={songDuration ? songDuration.toFixed(1) : "end"}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
                    <Settings2 className="h-3.5 w-3.5" />
                    <span>
                      Output: <strong>{resolvedRes.w}×{resolvedRes.h}</strong> · {fps} fps · {transition === "none" ? "hard cut" : transition} transition {lyricOverlay ? "· with subtitles" : "· no subtitles"}
                    </span>
                  </div>

                  {/* Render action */}
                  <div className="mt-4 pt-4 border-t">
                    <Button onClick={renderMusicVideo} disabled={rendering || scenes.length === 0} size="lg" className="w-full gap-2">
                      {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                      {rendering ? "Rendering…" : "Render Music Video"}
                    </Button>
                    {rendering && (
                      <div className="mt-3 space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Encoding video, mixing audio, applying transitions…</span>
                          <span>{renderProgress}%</span>
                        </div>
                        <Progress value={renderProgress} className="h-1.5" />
                      </div>
                    )}
                  </div>

                  {/* Warnings */}
                  {renderResult && renderResult.warnings.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      <p className="text-xs font-semibold flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                        <AlertCircle className="h-3.5 w-3.5" /> {renderResult.warnings.length} warning(s) from the renderer:
                      </p>
                      <ul className="text-xs text-muted-foreground list-disc ml-5 space-y-0.5 max-h-40 overflow-y-auto scrollbar-thin">
                        {renderResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Result */}
                  {renderResult && (
                    <div className="mt-4 p-4 rounded-lg border border-primary/30 bg-primary/5">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <p className="text-sm font-semibold">Music video rendered</p>
                      </div>
                      <video src={renderResult.asset.url} controls className="w-full rounded-lg bg-black" />
                      <div className="flex gap-2 mt-3">
                        <Button asChild variant="default" size="sm" className="gap-1.5">
                          <a href={renderResult.asset.url} download><Download className="h-3.5 w-3.5" /> Download MP4</a>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="gap-1.5">
                          <a href={renderResult.asset.url} target="_blank" rel="noreferrer"><Eye className="h-3.5 w-3.5" /> Open</a>
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between pt-3 mt-3 border-t">
                    <Button variant="ghost" onClick={() => setStep(4)} className="gap-1.5 text-sm">
                      <ChevronRight className="h-4 w-4 rotate-180" /> Back
                    </Button>
                    {renderResult && (
                      <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                        <Plus className="h-4 w-4" /> Start a new music video
                      </Button>
                    )}
                  </div>
                </SectionCard>
              </motion.div>
            )}

            {/* ============ Empty state when no project on steps 2-5 ============ */}
            {step !== 1 && !current && !loadingProject && (
              <motion.div
                key="no-project"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <SectionCard>
                  <EmptyState
                    icon={<Music2 className="h-6 w-6" />}
                    title="No project selected"
                    description="Pick or create a music video project in Step 1 first."
                    action={<Button onClick={() => setStep(1)} className="gap-2"><ChevronRight className="h-4 w-4 rotate-180" /> Go to Step 1</Button>}
                  />
                </SectionCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ============ New project dialog ============ */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Music className="h-4 w-4 text-primary" /> New Music Video</DialogTitle>
            <DialogDescription>Upload a song or pick an existing audio asset, then choose your mode.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mv-name">Project name</Label>
              <Input id="mv-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Awesome Song — Music Video" />
            </div>

            <div className="space-y-2">
              <Label>Mode</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewMode("montage")}
                  className={[
                    "p-3 rounded-lg border text-left transition-all",
                    newMode === "montage"
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border hover:border-primary/50",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    <Film className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Montage</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Visual scenes set to the music. No lip-sync.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setNewMode("singing")}
                  className={[
                    "p-3 rounded-lg border text-left transition-all",
                    newMode === "singing"
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border hover:border-primary/50",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    <Mic2 className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Singing Characters</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Characters appear on screen. Mouths will not sync.</p>
                </button>
              </div>
              {newMode === "singing" && (
                <div className="mt-2 p-2.5 rounded-md bg-red-500/10 border border-red-500/30 text-[11px] text-red-500 leading-snug">
                  <strong>⚠️ Z.ai&apos;s video model does NOT support audio-conditioned mouth/beak animation.</strong> &apos;Singing Characters&apos; mode will produce music montage with characters present, but their mouths will NOT sync to vocals. This is a model limitation, not a bug.
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Song source</Label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setSongSource("upload")}
                    className={[
                      "px-2.5 py-1 text-xs rounded-md transition-all",
                      songSource === "upload" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent",
                    ].join(" ")}
                  >
                    Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => setSongSource("existing")}
                    className={[
                      "px-2.5 py-1 text-xs rounded-md transition-all",
                      songSource === "existing" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent",
                    ].join(" ")}
                  >
                    Choose existing
                  </button>
                </div>
              </div>

              {songSource === "upload" ? (
                <div className="space-y-2">
                  <input
                    ref={fileSongRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => onUploadSong(e.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => fileSongRef.current?.click()}
                    className="w-full p-6 rounded-lg border-2 border-dashed grid place-items-center hover:border-primary hover:bg-accent/40 transition-all"
                  >
                    {uploadingSong ? (
                      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" /> Uploading…
                      </div>
                    ) : (
                      <div className="text-center">
                        <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                        <p className="text-sm font-medium mt-1.5">Click to upload an audio file</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">MP3, WAV, OGG, M4A</p>
                      </div>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {loadingAudio ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading audio assets…
                    </div>
                  ) : audioAssets.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-6 text-center">No audio assets uploaded yet. Switch to &apos;Upload&apos; to add one.</p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto scrollbar-thin space-y-1 pr-1">
                      {audioAssets.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => { setNewSongUrl(a.url); setNewSongName(a.name); }}
                          className={[
                            "w-full flex items-center gap-2 p-2 rounded-md text-left transition-all",
                            newSongUrl === a.url ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-accent/40",
                          ].join(" ")}
                        >
                          <Music2 className="h-4 w-4 text-primary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{a.name}</p>
                            <p className="text-[10px] text-muted-foreground">{formatBytes(a.size)} · {timeAgo(a.createdAt)}</p>
                          </div>
                          {newSongUrl === a.url && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {newSongUrl && (
                <div className="p-2.5 rounded-md bg-primary/5 border border-primary/20 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{newSongName || "Selected song"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setNewSongUrl(null); setNewSongName(""); }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {newSongUrl && (
                <audio controls src={newSongUrl} className="w-full h-9" preload="metadata" />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)}>Cancel</Button>
            <Button onClick={createProject} disabled={creating} className="gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {creating ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Import SRT dialog ============ */}
      <Dialog open={srtDialogOpen} onOpenChange={setSrtDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Import SRT lyrics</DialogTitle>
            <DialogDescription>Paste standard SRT subtitle content. Existing lyrics will be replaced.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              rows={10}
              value={srtContent}
              onChange={(e) => setSrtContent(e.target.value)}
              placeholder={`1\n00:00:00,000 --> 00:00:05,000\nFirst line of lyrics\n\n2\n00:00:05,000 --> 00:00:10,000\nSecond line of lyrics`}
              className="text-xs font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Importing SRT gives you precise timings (source: <code>imported-srt</code>). Use this if you have a properly aligned subtitle file.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSrtDialogOpen(false)}>Cancel</Button>
            <Button onClick={importSrt} disabled={importingSrt} className="gap-2">
              {importingSrt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importingSrt ? "Importing…" : "Import SRT"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function ProjectCard({ project, onOpen }: { project: MusicVideoProject; onOpen: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border bg-card overflow-hidden hover:border-primary/40 hover:shadow-md transition-all"
    >
      <div className="aspect-video bg-gradient-to-br from-primary/20 via-primary/5 to-background relative grid place-items-center">
        <Music2 className="h-8 w-8 text-primary/40" />
        <div className="absolute top-2 left-2 flex gap-1">
          <Badge variant={project.mode === "singing" ? "default" : "secondary"} className="text-[10px]">
            {project.mode === "singing" ? "Singing" : "Montage"}
          </Badge>
        </div>
        <div className="absolute top-2 right-2">
          <Badge variant="outline" className="text-[10px] bg-background/80">{formatDuration(project.songDuration)}</Badge>
        </div>
      </div>
      <div className="p-3">
        <p className="font-semibold text-sm truncate">{project.name}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{project.songName || "No song"}</p>
        <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-0.5"><Clapperboard className="h-3 w-3" /> {project._count?.scenes ?? project.scenes?.length ?? 0}</span>
          <span className="flex items-center gap-0.5"><ListMusic className="h-3 w-3" /> {project._count?.lyricLines ?? project.lyricLines?.length ?? 0}</span>
          {project.updatedAt && <span className="ml-auto">{timeAgo(project.updatedAt)}</span>}
        </div>
        <Button size="sm" variant="default" onClick={onOpen} className="w-full mt-3 gap-1.5 h-8 text-xs">
          <Play className="h-3.5 w-3.5" /> Continue
        </Button>
      </div>
    </motion.div>
  );
}

function LyricRow({
  line,
  index,
  onChange,
  onDelete,
}: {
  line: LyricLine;
  index: number;
  onChange: (patch: Partial<LyricLine>) => void;
  onDelete: () => void;
}) {
  const isEstimated = line.source === "asr-estimate";
  const sourceBadge = {
    "manual": { label: "manual", variant: "secondary" as const },
    "asr-estimate": { label: "asr-estimate", variant: "outline" as const },
    "imported-srt": { label: "imported-srt", variant: "outline" as const },
  }[line.source];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-lg border bg-card p-2.5"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="grid place-items-center h-6 w-6 rounded-md bg-muted text-xs font-bold text-muted-foreground shrink-0">
          {index + 1}
        </span>
        {isEstimated ? (
          <Badge className="text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40">
            <Clock className="h-2.5 w-2.5 mr-1" /> ESTIMATED — review manually
          </Badge>
        ) : (
          <Badge variant={sourceBadge.variant} className="text-[10px]">{sourceBadge.label}</Badge>
        )}
        <Button variant="ghost" size="sm" onClick={onDelete} className="ml-auto h-6 w-6 p-0 text-muted-foreground hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Input
        value={line.text}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="Lyric text…"
        className="text-sm mb-2"
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Start (s)</Label>
          <Input
            type="number"
            step="0.1"
            value={line.startTime ?? ""}
            onChange={(e) => onChange({ startTime: e.target.value === "" ? null : parseFloat(e.target.value) })}
            placeholder="0.0"
            className="text-xs h-8"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">End (s)</Label>
          <Input
            type="number"
            step="0.1"
            value={line.endTime ?? ""}
            onChange={(e) => onChange({ endTime: e.target.value === "" ? null : parseFloat(e.target.value) })}
            placeholder="0.0"
            className="text-xs h-8"
          />
        </div>
      </div>
    </motion.div>
  );
}

function SceneCard({
  scene,
  mode,
  busy,
  onGenerateImage,
  onGenerateVideo,
  onUploadVideo,
  onUpdate,
  onDelete,
}: {
  scene: Scene;
  mode: "montage" | "singing";
  busy: { kind: "image" | "video" | "upload"; progress: number } | null;
  onGenerateImage: () => void;
  onGenerateVideo: () => void;
  onUploadVideo: (files: FileList | null) => void;
  onUpdate: (patch: Partial<Scene>) => void;
  onDelete: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const duration = Math.max(0, scene.endTime - scene.startTime);
  const videoStatusBadge = {
    pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
    generating: { label: "Generating", className: "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40" },
    ready: { label: "Ready", className: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40" },
    failed: { label: "Failed", className: "bg-red-500/20 text-red-500 border-red-500/40" },
  }[scene.videoStatus];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border bg-card p-4"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="grid place-items-center h-7 w-7 rounded-md bg-primary text-primary-foreground text-xs font-bold shrink-0">
          {scene.index + 1}
        </span>
        <Badge variant="outline" className="text-[10px]">
          <Clock className="h-2.5 w-2.5 mr-1" />
          {formatDuration(scene.startTime)} – {formatDuration(scene.endTime)}
        </Badge>
        <Badge variant="outline" className="text-[10px]">{duration.toFixed(1)}s</Badge>
        <Badge className={`text-[10px] border ${videoStatusBadge.className}`}>
          {scene.videoStatus === "generating" && <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />}
          {scene.videoStatus === "ready" && <CheckCircle2 className="h-2.5 w-2.5 mr-1" />}
          {scene.videoStatus === "failed" && <AlertCircle className="h-2.5 w-2.5 mr-1" />}
          {videoStatusBadge.label}
        </Badge>
        {mode === "singing" ? (
          <Badge className="text-[10px] bg-red-500/20 text-red-500 border border-red-500/40">
            Lip-sync NOT SUPPORTED
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            Music montage — no lip-sync
          </Badge>
        )}
        <Button variant="ghost" size="sm" onClick={onDelete} className="ml-auto h-7 w-7 p-0 text-muted-foreground hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {scene.error && (
        <p className="text-xs text-red-500 mb-2">{scene.error}</p>
      )}

      {/* Image / Video preview */}
      <div className="grid sm:grid-cols-[200px_1fr] gap-3 mb-3">
        <div className="aspect-video rounded-lg overflow-hidden border bg-muted relative">
          {scene.videoUrl ? (
            <video src={scene.videoUrl} controls className="h-full w-full object-cover" />
          ) : scene.imageUrl ? (
            <img src={scene.imageUrl} alt={`Scene ${scene.index + 1}`} className="h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-muted-foreground">
              <ImageIcon className="h-6 w-6 opacity-40" />
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 bg-background/80 grid place-items-center">
              <div className="flex flex-col items-center gap-1.5">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-[10px] text-muted-foreground">
                  {busy.kind === "image" ? "Generating image…" : busy.kind === "video" ? `Video ${busy.progress}%` : "Uploading…"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Editable fields */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">Start (s)</Label>
              <Input
                type="number"
                step="0.1"
                value={scene.startTime}
                onChange={(e) => onUpdate({ startTime: parseFloat(e.target.value) || 0 })}
                className="text-xs h-8"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">End (s)</Label>
              <Input
                type="number"
                step="0.1"
                value={scene.endTime}
                onChange={(e) => onUpdate({ endTime: parseFloat(e.target.value) || 0 })}
                className="text-xs h-8"
              />
            </div>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Lyric text (for this scene)</Label>
            <Input
              value={scene.lyricText || ""}
              onChange={(e) => onUpdate({ lyricText: e.target.value || null })}
              placeholder="(instrumental)"
              className="text-xs h-8"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">Character name</Label>
              <Input
                value={scene.characterName || ""}
                onChange={(e) => onUpdate({ characterName: e.target.value || null })}
                placeholder="(none)"
                className="text-xs h-8"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Camera direction</Label>
              <Input
                value={scene.cameraDirection || ""}
                onChange={(e) => onUpdate({ cameraDirection: e.target.value || null })}
                placeholder="slow push-in"
                className="text-xs h-8"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Visual prompt */}
      <div className="mb-3">
        <Label className="text-[10px] text-muted-foreground">Visual prompt (used for image + video generation)</Label>
        <Textarea
          rows={2}
          value={scene.visualPrompt || ""}
          onChange={(e) => onUpdate({ visualPrompt: e.target.value || null })}
          placeholder="A neon-lit rooftop at night, rain falling, slow dolly forward…"
          className="text-xs"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onGenerateImage}
          disabled={!!busy}
          className="gap-1.5 text-xs h-8"
        >
          {busy?.kind === "image" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
          Generate image
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={onGenerateVideo}
          disabled={!!busy || !scene.visualPrompt?.trim()}
          className="gap-1.5 text-xs h-8"
        >
          {busy?.kind === "video" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
          Generate video
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => onUploadVideo(e.target.files)}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={!!busy}
          className="gap-1.5 text-xs h-8"
        >
          {busy?.kind === "upload" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Upload video
        </Button>
      </div>
    </motion.div>
  );
}
