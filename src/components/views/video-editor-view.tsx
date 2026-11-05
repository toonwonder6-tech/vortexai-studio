"use client";
import { useEffect, useRef, useState } from "react";
import { PageHeader, SectionCard, EmptyState } from "@/components/shared";
import { api, formatBytes, timeAgo } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Scissors, Plus, Trash2, Play, Film, Image as ImageIcon, Type,
  Download, Loader2, Wand2, Clapperboard, GripVertical,
  Music, Volume2, Check, Square,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface Clip {
  id: string;
  url: string;
  type: "video" | "image";
  name: string;
  start: number;
  end: number | null;
  duration: number; // display duration on timeline
}

interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
}

interface MusicTrack {
  id: string;
  title: string;
  description: string;
  mood: string;
  url: string;
  duration: number;
  size: number;
}

const RESOLUTIONS = [
  { label: "720p (1280×720)", value: "1280x720", w: 1280, h: 720 },
  { label: "1080p (1920×1080)", value: "1920x1080", w: 1920, h: 1080 },
  { label: "Square (1024×1024)", value: "1024x1024", w: 1024, h: 1024 },
  { label: "Vertical (720×1280)", value: "720x1280", w: 720, h: 1280 },
];

export function VideoEditorView() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [overlays, setOverlays] = useState<TextOverlay[]>([]);
  const [resolution, setResolution] = useState(RESOLUTIONS[0]);
  const [fps, setFps] = useState(30);
  const [audioOn, setAudioOn] = useState(true);
  const [transition, setTransition] = useState<string>("none");
  const [transitionDuration, setTransitionDuration] = useState(0.5);
  const [assets, setAssets] = useState<any[]>([]);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [outputs, setOutputs] = useState<any[]>([]);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Background music state
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [musicLoading, setMusicLoading] = useState(true);
  const [selectedMusic, setSelectedMusic] = useState<string | null>(null);
  const [musicVolume, setMusicVolume] = useState(50);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  useEffect(() => {
    (async () => {
      const cancelled = { v: false };
      const [vid, img, out, music] = await Promise.all([
        api("/api/assets?type=video&limit=40"),
        api("/api/assets?type=image&limit=40"),
        api("/api/assets?type=video&limit=20"),
        api<{ tracks: MusicTrack[] }>("/api/music"),
      ]);
      if (cancelled.v) return;
      const all = [
        ...(vid.ok ? vid.data.assets : []),
        ...(img.ok ? img.data.assets : []),
      ];
      setAssets(all);
      setOutputs(out.ok ? out.data.assets.filter((a: any) => a.meta && JSON.parse(a.meta || "{}").editor) : []);
      if (music.ok && music.data) {
        setMusicTracks(music.data.tracks);
      } else if (!music.ok) {
        toast.error(music.error || "Failed to load music library");
      }
      setMusicLoading(false);
    })();
  }, []);

  /** Pause every other preview audio element so only one track plays at a time. */
  function onMusicPlay(id: string) {
    Object.entries(audioRefs.current).forEach(([key, el]) => {
      if (key !== id && el) {
        el.pause();
      }
    });
  }

  function addAsset(asset: any) {
    const clip: Clip = {
      id: Math.random().toString(36).slice(2),
      url: asset.url,
      type: asset.type === "image" ? "image" : "video",
      name: asset.name,
      start: 0,
      end: null,
      duration: asset.type === "image" ? 3 : 6,
    };
    setClips((p) => [...p, clip]);
  }

  async function onUpload(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("name", f.name);
      const res = await fetch("/api/assets", { method: "POST", body: fd });
      const json = await res.json();
      if (json.ok) addAsset(json.data.asset);
      else toast.error(json.error || "Upload failed");
    }
  }

  function updateClip(id: string, patch: Partial<Clip>) {
    setClips((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function removeClip(id: string) {
    setClips((p) => p.filter((c) => c.id !== id));
    if (selectedClip === id) setSelectedClip(null);
  }
  function addOverlay() {
    setOverlays((p) => [
      ...p,
      { id: Math.random().toString(36).slice(2), text: "New text", x: 50, y: 50, size: 32, color: "white" },
    ]);
  }
  function updateOverlay(id: string, patch: Partial<TextOverlay>) {
    setOverlays((p) => p.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }
  function removeOverlay(id: string) {
    setOverlays((p) => p.filter((o) => o.id !== id));
  }
  function moveClip(id: string, dir: -1 | 1) {
    setClips((p) => {
      const i = p.findIndex((c) => c.id === id);
      if (i < 0) return p;
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const copy = [...p];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  const totalDuration = clips.reduce((s, c) => s + c.duration, 0);

  async function render() {
    if (clips.length === 0) {
      toast.error("Add at least one clip to the timeline.");
      return;
    }
    setRendering(true);
    setRenderProgress(10);
    const selectedTrack = musicTracks.find((t) => t.id === selectedMusic);
    const r = await api("/api/editor/render", {
      method: "POST",
      body: JSON.stringify({
        project: {
          clips: clips.map((c) => ({
            url: c.url,
            type: c.type,
            start: c.type === "video" ? c.start : undefined,
            end: c.type === "video" ? c.end : undefined,
            duration: c.type === "image" ? c.duration : undefined,
          })),
          resolution: { w: resolution.w, h: resolution.h },
          fps,
          textOverlay: overlays,
          musicUrl: selectedTrack ? selectedTrack.url : undefined,
          musicVolume: selectedTrack ? musicVolume : undefined,
          transition,
          transitionDuration,
        },
        name: `Edit ${new Date().toLocaleString()}`,
      }),
    });
    setRendering(false);
    setRenderProgress(0);
    if (!r.ok) {
      toast.error(r.error || "Render failed");
      return;
    }
    toast.success("Video rendered!");
    setOutputs((p) => [r.data.asset, ...p]);
  }

  const selected = clips.find((c) => c.id === selectedClip);

  return (
    <div>
      <PageHeader
        title="Video Editor"
        description="A browser-based editing studio. Arrange clips on the timeline, trim, add text overlays, then render with server-side FFmpeg."
        icon={<Scissors className="h-5 w-5" />}
        actions={
          <Button onClick={render} disabled={rendering} className="gap-2">
            {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
            {rendering ? "Rendering…" : "Render Video"}
          </Button>
        }
      />

      {rendering && (
        <div className="mb-4 rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2 text-sm mb-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Rendering your video with FFmpeg…
          </div>
          <Progress value={renderProgress} className="h-2" />
        </div>
      )}

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Left: asset palette */}
        <div className="lg:col-span-1 space-y-4">
          <SectionCard title="Media" description="Click to add to timeline.">
            <input ref={fileRef} type="file" accept="video/*,image/*" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
            <Button variant="outline" size="sm" className="w-full mb-3 gap-2" onClick={() => fileRef.current?.click()}>
              <Plus className="h-4 w-4" /> Upload media
            </Button>
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto scrollbar-thin">
              {assets.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No media yet. Generate videos/images or upload.</p>
              ) : (
                assets.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => addAsset(a)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg border hover:bg-accent/40 transition-colors text-left"
                  >
                    <div className="h-9 w-12 rounded bg-muted grid place-items-center shrink-0 overflow-hidden">
                      {a.type === "image" ? (
                        <img src={a.url} alt="" className="h-full w-full object-cover" />
                      ) : a.type === "video" ? (
                        <Film className="h-4 w-4 text-muted-foreground" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{a.name}</p>
                      <p className="text-[10px] text-muted-foreground">{a.type} · {formatBytes(a.size)}</p>
                    </div>
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard title="Text overlays">
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={addOverlay}>
              <Type className="h-4 w-4" /> Add text
            </Button>
            <div className="space-y-2 mt-2">
              {overlays.map((o) => (
                <div key={o.id} className="p-2 rounded-lg border space-y-1.5">
                  <Input value={o.text} onChange={(e) => updateOverlay(o.id, { text: e.target.value })} className="h-8 text-xs" />
                  <div className="flex gap-1.5">
                    <Input type="number" value={o.x} onChange={(e) => updateOverlay(o.id, { x: Number(e.target.value) })} className="h-7 text-xs" placeholder="x" />
                    <Input type="number" value={o.y} onChange={(e) => updateOverlay(o.id, { y: Number(e.target.value) })} className="h-7 text-xs" placeholder="y" />
                    <Input type="number" value={o.size} onChange={(e) => updateOverlay(o.id, { size: Number(e.target.value) })} className="h-7 text-xs" placeholder="size" />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeOverlay(o.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Center: preview + timeline */}
        <div className="lg:col-span-2 space-y-4">
          <SectionCard title="Preview" description={`${resolution.label} · ${fps} fps · ${totalDuration.toFixed(1)}s total`}>
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden grid place-items-center">
              {selected ? (
                selected.type === "video" ? (
                  <video key={selected.id} src={selected.url} controls className="max-h-full max-w-full" />
                ) : (
                  <img src={selected.url} alt="" className="max-h-full max-w-full object-contain" />
                )
              ) : (
                <div className="text-center text-muted-foreground">
                  <Clapperboard className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Select a clip to preview</p>
                </div>
              )}
              {overlays.length > 0 && selected && (
                <div className="absolute inset-0 pointer-events-none">
                  {overlays.map((o) => (
                    <span
                      key={o.id}
                      className="absolute font-semibold drop-shadow-lg"
                      style={{ left: `${o.x}%`, top: `${o.y}%`, fontSize: o.size, color: o.color, transform: "translate(-50%,-50%)" }}
                    >
                      {o.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Timeline" description="Drag-free arrange with the move buttons. Click a clip to edit.">
            {clips.length === 0 ? (
              <EmptyState icon={<Film className="h-6 w-6" />} title="Empty timeline" description="Add clips from the media panel on the left." />
            ) : (
              <div className="space-y-2">
                {/* Ruler */}
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground px-1">
                  <span className="w-6">№</span>
                  <span className="flex-1">Clip</span>
                  <span className="w-16 text-center">Start</span>
                  <span className="w-16 text-center">End/Sec</span>
                  <span className="w-16 text-center">Move</span>
                  <span className="w-8"></span>
                </div>
                {clips.map((c, i) => (
                  <motion.div
                    layout
                    key={c.id}
                    className={`flex items-center gap-1 p-1.5 rounded-lg border bg-card ${selectedClip === c.id ? "ring-2 ring-primary" : ""}`}
                  >
                    <span className="w-6 text-center text-xs text-muted-foreground">{i + 1}</span>
                    <button
                      onClick={() => setSelectedClip(c.id)}
                      className="flex-1 flex items-center gap-2 min-w-0 text-left"
                    >
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="h-7 w-10 rounded bg-muted grid place-items-center shrink-0 overflow-hidden">
                        {c.type === "image" ? <ImageIcon className="h-3 w-3 text-muted-foreground" /> : <Film className="h-3 w-3 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{c.name}</p>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[9px] h-4">{c.type}</Badge>
                          <span className="text-[10px] text-muted-foreground">{c.duration.toFixed(1)}s</span>
                        </div>
                      </div>
                    </button>
                    {c.type === "video" ? (
                      <>
                        <Input type="number" step="0.1" value={c.start} onChange={(e) => updateClip(c.id, { start: Number(e.target.value) })} className="w-16 h-7 text-xs" />
                        <Input type="number" step="0.1" value={c.end ?? ""} placeholder="—" onChange={(e) => updateClip(c.id, { end: e.target.value ? Number(e.target.value) : null })} className="w-16 h-7 text-xs" />
                      </>
                    ) : (
                      <>
                        <span className="w-16 text-center text-[10px] text-muted-foreground">—</span>
                        <Input type="number" step="0.1" value={c.duration} onChange={(e) => updateClip(c.id, { duration: Number(e.target.value) })} className="w-16 h-7 text-xs" />
                      </>
                    )}
                    <div className="flex w-16 justify-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveClip(c.id, -1)} disabled={i === 0}>↑</Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveClip(c.id, 1)} disabled={i === clips.length - 1}>↓</Button>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeClip(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </motion.div>
                ))}
                <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
                  <span>{clips.length} clips</span>
                  <span>Total: {totalDuration.toFixed(1)}s</span>
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right: export settings + outputs */}
        <div className="lg:col-span-1 space-y-4">
          <SectionCard title="Export settings">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Resolution</Label>
                <Select
                  value={resolution.value}
                  onValueChange={(v) => setResolution(RESOLUTIONS.find((r) => r.value === v)!)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RESOLUTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
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
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer">Audio track</Label>
                <Switch checked={audioOn} onCheckedChange={setAudioOn} />
              </div>
              {/* Transition selector */}
              <div className="space-y-2 pt-2 border-t">
                <Label>Transition between clips</Label>
                <Select value={transition} onValueChange={setTransition}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (hard cut)</SelectItem>
                    <SelectItem value="fade">Fade</SelectItem>
                    <SelectItem value="dissolve">Dissolve</SelectItem>
                    <SelectItem value="slideleft">Slide Left</SelectItem>
                    <SelectItem value="slideright">Slide Right</SelectItem>
                    <SelectItem value="slideup">Slide Up</SelectItem>
                    <SelectItem value="slidedown">Slide Down</SelectItem>
                    <SelectItem value="circlecrop">Circle Crop</SelectItem>
                    <SelectItem value="radial">Radial Wipe</SelectItem>
                    <SelectItem value="wipeleft">Wipe Left</SelectItem>
                    <SelectItem value="wiperight">Wipe Right</SelectItem>
                  </SelectContent>
                </Select>
                {transition !== "none" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Duration</Label>
                      <span className="text-xs text-muted-foreground">{transitionDuration.toFixed(1)}s</span>
                    </div>
                    <Slider value={[transitionDuration]} min={0.2} max={2} step={0.1} onValueChange={(v) => setTransitionDuration(v[0])} />
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Rendering runs server-side via FFmpeg: each clip is normalized to the target resolution & fps, then concatenated. Text overlays are burned in with drawtext.
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Background music" description={`${musicTracks.length} royalty-free tracks`}>
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Volume2 className="h-3.5 w-3.5" /> Music volume
                  </Label>
                  <span className="text-xs tabular-nums text-muted-foreground">{musicVolume}%</span>
                </div>
                <Slider
                  value={[musicVolume]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => setMusicVolume(v[0])}
                  disabled={!selectedMusic}
                />
              </div>

              <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin pr-0.5">
                {musicLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : musicTracks.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No music tracks available.
                  </p>
                ) : (
                  musicTracks.map((t) => {
                    const isSel = selectedMusic === t.id;
                    return (
                      <motion.div
                        layout
                        key={t.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border bg-card transition-colors ${isSel ? "ring-2 ring-primary" : "hover:bg-accent/40"}`}
                      >
                        <button
                          onClick={() => setSelectedMusic(isSel ? null : t.id)}
                          className={`grid place-items-center h-7 w-7 rounded-md shrink-0 transition-colors ${isSel ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                          aria-label={isSel ? "Deselect track" : "Select track"}
                          title={isSel ? "Selected as background music" : "Click to select"}
                        >
                          {isSel ? <Check className="h-3.5 w-3.5" /> : <Music className="h-3.5 w-3.5" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{t.title}</p>
                          <div className="flex items-center gap-1.5">
                            {t.mood && <Badge variant="outline" className="text-[9px] h-4">{t.mood}</Badge>}
                            <span className="text-[10px] text-muted-foreground">{t.duration}s</span>
                          </div>
                        </div>
                        <audio
                          ref={(el) => { audioRefs.current[t.id] = el; }}
                          src={t.url}
                          controls
                          onPlay={() => onMusicPlay(t.id)}
                          preload="none"
                          className="h-7 w-28 shrink-0"
                        />
                      </motion.div>
                    );
                  })
                )}
              </div>

              {selectedMusic && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full gap-1.5 text-muted-foreground"
                  onClick={() => setSelectedMusic(null)}
                >
                  <Square className="h-3.5 w-3.5" /> Clear selection
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground">
                Pick a track to mix into the final render at the chosen volume. Tracks are procedurally generated, royalty-free, and loop to match the video duration.
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Rendered videos" description={`${outputs.length} exports`}>
            {outputs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Your rendered videos will appear here.</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin">
                {outputs.map((o) => (
                  <div key={o.id} className="rounded-lg border overflow-hidden">
                    <video src={o.url} controls className="w-full aspect-video bg-black" />
                    <div className="p-2 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{o.name}</p>
                        <p className="text-[10px] text-muted-foreground">{timeAgo(o.createdAt)} · {formatBytes(o.size)}</p>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" asChild>
                        <a href={o.url} download><Download className="h-3.5 w-3.5" /></a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
