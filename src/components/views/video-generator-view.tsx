"use client";
import { useEffect, useRef, useState } from "react";
import { PageHeader, SectionCard, EmptyState } from "@/components/shared";
import { api, fileToBase64, timeAgo } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sparkles, Clapperboard, Image as ImageIcon, Wand2, Loader2, Film, Upload, X, Download, RefreshCw, CheckCircle2, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const ASPECT_SIZES = [
  { label: "16:9 Landscape", value: "1280x720" },
  { label: "9:16 Portrait", value: "720x1280" },
  { label: "1:1 Square", value: "1024x1024" },
  { label: "4:3 Classic", value: "1024x768" },
];

// Z.ai cogvideox supports only 5s or 10s per clip. For longer videos, use
// the Extend feature or Video Editor to combine multiple clips.
const DURATIONS = [5, 10];

/** Style presets — each injects a rich style suffix into the prompt. */
const STYLE_PRESETS = [
  { id: "none", label: "No style", emoji: "🎯", suffix: "smooth motion, consistent characters, natural physics, motion blur" },
  { id: "cinematic", label: "Cinematic", emoji: "🎬", suffix: "cinematic style, dramatic lighting, film grain, shallow depth of field, anamorphic lens, color graded, 35mm, professional cinematography, smooth camera motion, motion blur, consistent characters" },
  { id: "3d-animation", label: "3D Animation", emoji: "🧸", suffix: "Pixar-style 3D animation, soft global illumination, subsurface scattering, vibrant colors, smooth rendering, expressive characters, polished surfaces, consistent character design, smooth animation, motion blur, hair and cloth dynamics" },
  { id: "anime", label: "Anime", emoji: "🌸", suffix: "anime style, cel-shaded, bold outlines, vibrant colors, dramatic skies, Studio Ghibli inspired, hand-drawn aesthetic, expressive eyes" },
  { id: "realistic", label: "Photorealistic", emoji: "📷", suffix: "photorealistic, ultra-detailed, 8K, natural lighting, shot on RED camera, lifelike textures, true-to-life colors, documentary realism, smooth motion, motion blur, consistent lighting" },
  { id: "claymation", label: "Claymation", emoji: "🪀", suffix: "claymation stop-motion animation, clay texture, handcrafted, Wallace & Gromit style, tactile, charmingly imperfect, studio lighting" },
  { id: "watercolor", label: "Watercolor", emoji: "🎨", suffix: "watercolor painting style, soft washes, bleeding colors, textured paper, hand-painted, dreamy, artistic, flowing pigments" },
  { id: "cyberpunk", label: "Cyberpunk", emoji: "🌃", suffix: "cyberpunk style, neon-lit, rain-soaked streets, holographic ads, Blade Runner aesthetic, high contrast, moody atmosphere, futuristic" },
  { id: "vintage", label: "Vintage Film", emoji: "📽️", suffix: "vintage 1970s film, Super 8, warm faded colors, light leaks, grain, nostalgic, retro, analog charm, sepia tones" },
  { id: "noir", label: "Film Noir", emoji: "🕵️", suffix: "film noir, black and white, high contrast, dramatic shadows, venetian blind lighting, 1940s detective mood, moody, atmospheric" },
  { id: "fantasy", label: "Fantasy", emoji: "🧙", suffix: "epic fantasy style, magical glow, ethereal atmosphere, Lord of the Rings inspired, sweeping vistas, golden hour, mythical, enchanted" },
  { id: "low-poly", label: "Low Poly", emoji: "🔷", suffix: "low-poly 3D art, geometric facets, flat shading, minimalist, stylized, colorful, isometric, clean polygons" },
  { id: "pixel-art", label: "Pixel Art", emoji: "👾", suffix: "pixel art, 16-bit retro game style, limited palette, crisp pixels, nostalgic, SNES era, dithering, chunky" },
  { id: "documentary", label: "Documentary", emoji: "🎥", suffix: "documentary style, handheld camera, natural lighting, observational, BBC nature, candid, real-world, unscripted feel" },
  { id: "music-video", label: "Music Video", emoji: "🎵", suffix: "music video style, dynamic editing, rhythmic cuts, colored gels, smoke effects, stylized lighting, MTV aesthetic, energetic" },
  { id: "product-ad", label: "Product Ad", emoji: "🛍️", suffix: "product commercial, studio lighting, clean background, macro details, rotating turntable, premium, sleek, high-end advertising" },
] as const;

export function VideoGeneratorView() {
  const { user, setView } = useApp();
  const [mode, setMode] = useState<"text" | "image" | "multi" | "script" | "extend">("text");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [quality, setQuality] = useState<"speed" | "quality">("quality");
  const [withAudio, setWithAudio] = useState(true);
  const [size, setSize] = useState("1280x720");
  const [duration, setDuration] = useState(5);
  const [fps, setFps] = useState(30);
  const [script, setScript] = useState("");
  const [scriptAnalysis, setScriptAnalysis] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [realismBoost, setRealismBoost] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [styleId, setStyleId] = useState<string>("none");
  const [images, setImages] = useState<{ url: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  // Extend mode state
  const [extendVideo, setExtendVideo] = useState<{ url: string; name: string } | null>(null);
  const [extendFrame, setExtendFrame] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [videoAssets, setVideoAssets] = useState<any[]>([]);
  // Enhance state
  const [enhanceJob, setEnhanceJob] = useState<any>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceOpts, setEnhanceOpts] = useState({
    motionBlur: true,
    interpolate: true,
    colorGrade: "vibrant",
    stabilize: false,
    sharpen: true,
    audioNormalize: true,
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedStyle = STYLE_PRESETS.find((s) => s.id === styleId) || STYLE_PRESETS[0];
  const realismSuffix = realismBoost ? ", ultra-realistic, photorealistic, 8K, natural lighting, lifelike textures, true-to-life colors, shot on RED camera, shallow depth of field, film grain, professional cinematography" : "";
  const finalPrompt = [prompt.trim(), selectedStyle.suffix, realismSuffix].filter(Boolean).join(", ");

  // Analyze the script using Z.ai text model — extracts key scenes, characters,
  // and builds an optimized video prompt from the script content.
  async function analyzeScript() {
    if (!script.trim()) {
      toast.error("Please paste a script first.");
      return;
    }
    setAnalyzing(true);
    setScriptAnalysis(null);
    toast.info("AI is reading and understanding your script…");
    // ASYNC: POST returns a job immediately, then we poll until done.
    const r = await api<{ job: any }>("/api/ai/text", {
      method: "POST",
      body: JSON.stringify({
        prompt: script,
        mode: "script-to-video",
        json: true,
      }),
    });
    if (!r.ok || !r.data?.job) {
      setAnalyzing(false);
      toast.error(r.error || "Could not analyze script.");
      return;
    }
    const jobId = r.data.job.id;
    const poll = setInterval(async () => {
      const pr = await api<{ job: any }>(`/api/ai/text?id=${encodeURIComponent(jobId)}`);
      if (pr.ok && pr.data?.job) {
        const j = pr.data.job;
        if (j.status === "completed" && j.resultMeta) {
          clearInterval(poll);
          setAnalyzing(false);
          const meta = JSON.parse(j.resultMeta);
          if (meta.json) {
            setScriptAnalysis(meta.json);
            if (meta.json.videoPrompt) {
              setPrompt(meta.json.videoPrompt);
            }
            toast.success("Script understood! Review the AI's analysis below.");
          } else {
            toast.error("Could not parse script analysis.");
          }
        } else if (j.status === "failed" || j.status === "expired") {
          clearInterval(poll);
          setAnalyzing(false);
          toast.error(j.error || "Could not analyze script.");
        }
      }
    }, 3000);
    setTimeout(() => { clearInterval(poll); setAnalyzing(false); }, 120000);
  }

  useEffect(() => {
    refreshJobs();
  }, []);

  // Load video assets when entering extend mode
  useEffect(() => {
    if (mode === "extend" && videoAssets.length === 0) {
      api("/api/assets?type=video&limit=50").then((r) => {
        if (r.ok) setVideoAssets(r.data.assets);
      });
    }
  }, [mode]);

  async function refreshJobs() {
    const r = await api("/api/jobs?type=video&limit=20");
    if (r.ok) setJobs(r.data.jobs);
  }

  // Extract the last frame from the selected video using FFmpeg (server-side)
  async function extractLastFrame() {
    if (!extendVideo) {
      toast.error("Select a video to extend first.");
      return;
    }
    setExtracting(true);
    setExtendFrame(null);
    toast.info("Extracting last frame from video…");
    const r = await api<{ asset: { url: string } }>("/api/video/extend", {
      method: "POST",
      body: JSON.stringify({ videoUrl: extendVideo.url }),
    });
    setExtracting(false);
    if (r.ok && r.data?.asset?.url) {
      setExtendFrame(r.data.asset.url);
      toast.success("Last frame extracted! Now write what happens next.");
    } else {
      toast.error(r.error || "Could not extract last frame.");
    }
  }

  async function onUpload(files: FileList | null) {
    if (!files) return;
    const uploaded = [...files];
    for (const f of uploaded) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("name", f.name);
      const res = await fetch("/api/assets", { method: "POST", body: fd });
      const json = await res.json();
      if (json.ok) {
        setImages((p) => [...p, { url: json.data.asset.url, name: f.name }]);
      } else {
        toast.error(json.error || "Upload failed");
      }
    }
  }

  async function generate() {
    if (mode === "text" && !prompt.trim()) {
      toast.error("Please enter a prompt.");
      return;
    }
    if ((mode === "image" || mode === "multi") && images.length === 0) {
      toast.error("Please upload at least one reference image.");
      return;
    }
    if (mode === "extend" && !extendFrame) {
      toast.error("Extract the last frame from your video first.");
      return;
    }
    if (mode === "extend" && !prompt.trim()) {
      toast.error("Describe what happens next in the video.");
      return;
    }
    setSubmitting(true);
    const r = await api("/api/ai/video", {
      method: "POST",
      body: JSON.stringify({
        prompt: finalPrompt || undefined,
        negativePrompt: negativePrompt || undefined,
        imageUrls: mode === "text" ? [] : mode === "extend" ? [extendFrame!] : images.map((i) => i.url),
        quality,
        withAudio,
        size,
        duration,
        fps,
        advanced,
        name: (prompt.slice(0, 40) || "Video generation") + (styleId !== "none" ? ` · ${selectedStyle.label}` : ""),
      }),
    });
    setSubmitting(false);
    if (!r.ok) {
      toast.error(r.error || "Failed to submit generation");
      return;
    }
    toast.success("Video queued! Submitting to Z.ai in the background — you'll see progress below.");
    setPrompt("");
    await refreshJobs();
    pollJob(r.data.job.id);
  }

  async function pollJob(jobId: string) {
    let tries = 0;
    const interval = setInterval(async () => {
      tries++;
      const r = await api(`/api/ai/video?id=${jobId}`);
      if (r.ok) {
        setJobs((prev) => prev.map((j) => (j.id === jobId ? r.data.job : j)));
        if (r.data.job.status === "completed") {
          clearInterval(interval);
          toast.success("Your video is ready!");
        } else if (r.data.job.status === "failed" || r.data.job.status === "expired") {
          clearInterval(interval);
          toast.error(r.data.job.error || "Generation failed.");
        }
        // "waiting" = background is submitting to Z.ai (may retry on 429)
        // "submitted" = Z.ai accepted, generating
        // "processing" = polling Z.ai for result
      }
      // ~15 min max at 6s intervals
      if (tries > 150) clearInterval(interval);
    }, 6000);
  }

  async function improvePrompt() {
    if (!prompt.trim()) {
      toast.error("Write a prompt first.");
      return;
    }
    toast.info("Enhancing prompt…");
    const r = await api("/api/ai/prompt", {
      method: "POST",
      body: JSON.stringify({ prompt, mode: "improve", style: "cinematic" }),
    });
    if (r.ok && r.data.result?.prompt) {
      setPrompt(r.data.result.prompt);
      if (r.data.result.negativePrompt) setNegativePrompt(r.data.result.negativePrompt);
      toast.success("Prompt enhanced!");
    } else {
      toast.error("Could not enhance prompt.");
    }
  }

  return (
    <div>
      <PageHeader
        title="AI Video Generator"
        description="Generate cinematic videos from text or reference images using the Z.ai video engine. Supports multi-reference, audio, and configurable duration."
        icon={<Clapperboard className="h-5 w-5" />}
        actions={
          <Button variant="outline" onClick={() => setView("prompt-assistant")} className="gap-2">
            <Sparkles className="h-4 w-4" /> Prompt Assistant
          </Button>
        }
      />

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left: controls */}
        <div className="lg:col-span-3 space-y-4">
          <SectionCard title="Generation mode">
            <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="text" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Text</TabsTrigger>
                <TabsTrigger value="image" className="gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Image</TabsTrigger>
                <TabsTrigger value="multi" className="gap-1.5"><Film className="h-3.5 w-3.5" /> Multi-Ref</TabsTrigger>
                <TabsTrigger value="script" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Script</TabsTrigger>
                <TabsTrigger value="extend" className="gap-1.5"><Wand2 className="h-3.5 w-3.5" /> Extend</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="mt-4 space-y-3">
              {/* Extend mode: pick a video, extract last frame, continue */}
              {mode === "extend" && (
                <div className="space-y-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                  <Label className="text-sm font-semibold">Select a video to extend — the last frame will be extracted automatically</Label>
                  {extracting && (
                    <div className="flex items-center gap-2 text-xs text-primary">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting last frame…
                    </div>
                  )}
                  {videoAssets.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No videos yet. Generate a video first, then come back to extend it.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto scrollbar-thin">
                      {videoAssets.map((v) => (
                        <button
                          key={v.id}
                          onClick={async () => {
                            setExtendVideo({ url: v.url, name: v.name });
                            setExtendFrame(null);
                            // Auto-extract the last frame immediately on selection
                            setExtracting(true);
                            toast.info("Extracting last frame…");
                            const r = await api<{ asset: { url: string } }>("/api/video/extend", {
                              method: "POST",
                              body: JSON.stringify({ videoUrl: v.url }),
                            });
                            setExtracting(false);
                            if (r.ok && r.data?.asset?.url) {
                              setExtendFrame(r.data.asset.url);
                              toast.success("Last frame extracted! Write what happens next, then Generate.");
                            } else {
                              toast.error(r.error || "Could not extract last frame.");
                            }
                          }}
                          className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${extendVideo?.url === v.url ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"}`}
                        >
                          <video src={v.url} className="h-full w-full object-cover" muted preload="metadata" />
                          <span className="absolute bottom-1 left-1 text-[9px] bg-background/80 px-1 rounded truncate max-w-[80%]">{v.name.slice(0, 20)}</span>
                          {extendVideo?.url === v.url && (
                            <span className="absolute top-1 right-1 grid place-items-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px]">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {extendFrame && (
                    <div className="space-y-2 p-3 rounded-lg bg-card border">
                      <p className="text-xs font-bold text-primary uppercase tracking-wide">✓ Last frame extracted — ready to extend</p>
                      <div className="flex gap-3">
                        <div className="relative w-32 aspect-video rounded-lg overflow-hidden border shrink-0">
                          <img src={extendFrame} alt="Last frame" className="h-full w-full object-cover" />
                        </div>
                        <div className="flex-1 text-xs text-muted-foreground">
                          <p>This frame will be the <strong className="text-primary">first frame</strong> of your new video, creating a seamless continuation.</p>
                          <p className="mt-1">Now write what happens next in the prompt box below, then click Generate Video.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Script mode: paste & analyze */}
              {mode === "script" && (
                <div className="space-y-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Paste your script</Label>
                    <Button variant="default" size="sm" onClick={analyzeScript} disabled={analyzing} className="gap-1.5 h-7 text-xs">
                      {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                      {analyzing ? "Analyzing…" : "Understand Script"}
                    </Button>
                  </div>
                  <Textarea
                    rows={5}
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    placeholder="Paste your full script here. The AI will read it, understand the characters, setting, mood, and key actions, then generate an optimized video prompt that captures the essence of your script…"
                    className="text-sm"
                  />
                  {scriptAnalysis && (
                    <div className="space-y-2 p-3 rounded-lg bg-card border">
                      <p className="text-xs font-bold text-primary uppercase tracking-wide">AI Script Analysis</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {scriptAnalysis.title && <div><span className="text-muted-foreground">Title:</span> <span className="font-medium">{scriptAnalysis.title}</span></div>}
                        {scriptAnalysis.setting && <div><span className="text-muted-foreground">Setting:</span> <span className="font-medium">{scriptAnalysis.setting}</span></div>}
                        {scriptAnalysis.mood && <div><span className="text-muted-foreground">Mood:</span> <span className="font-medium">{scriptAnalysis.mood}</span></div>}
                      </div>
                      {scriptAnalysis.summary && <p className="text-xs text-muted-foreground italic">{scriptAnalysis.summary}</p>}
                      {scriptAnalysis.characters && (
                        <div className="flex flex-wrap gap-1">
                          <span className="text-xs text-muted-foreground">Characters:</span>
                          {scriptAnalysis.characters.map((c: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-[10px]">{c}</Badge>
                          ))}
                        </div>
                      )}
                      {scriptAnalysis.keyActions && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Key actions:</p>
                          <ul className="text-xs space-y-0.5 ml-4 list-disc">
                            {scriptAnalysis.keyActions.map((a: string, i: number) => <li key={i}>{a}</li>)}
                          </ul>
                        </div>
                      )}
                      <p className="text-[11px] text-primary mt-2">✓ Video prompt auto-filled below from script analysis. Edit if needed, then generate.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Style presets */}
              <div className="space-y-2">
                <Label>Style preset</Label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto scrollbar-thin">
                  {STYLE_PRESETS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStyleId(s.id)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                        styleId === s.id
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      <span>{s.emoji}</span>
                      {s.label}
                    </button>
                  ))}
                </div>
                {styleId !== "none" && (
                  <p className="text-[11px] text-muted-foreground italic">
                    Appending: {selectedStyle.suffix.slice(0, 80)}{selectedStyle.suffix.length > 80 ? "…" : ""}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Prompt</Label>
                  <Button variant="ghost" size="sm" onClick={improvePrompt} className="h-7 gap-1.5 text-xs">
                    <Wand2 className="h-3.5 w-3.5" /> Improve
                  </Button>
                </div>
                <Textarea
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A cinematic drone shot soaring over a neon-lit futuristic city at night, rain-slicked streets reflecting holographic billboards, volumetric fog, 35mm film grain…"
                />
              </div>

              <div className="space-y-2">
                <Label>Negative prompt (optional)</Label>
                <Input
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="blurry, low quality, distorted, watermark, text"
                />
              </div>

              {(mode === "image" || mode === "multi") && (
                <div className="space-y-2">
                  <Label>{mode === "multi" ? "Reference images (2-4 recommended)" : "First frame image"}</Label>
                  <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
                  <div className="grid grid-cols-3 gap-2">
                    {images.map((img, i) => (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden border group">
                        <img src={img.url} alt="" className="h-full w-full object-cover" />
                        <button
                          onClick={() => setImages((p) => p.filter((_, idx) => idx !== i))}
                          className="absolute top-1 right-1 grid place-items-center h-6 w-6 rounded-full bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <span className="absolute bottom-1 left-1 text-[10px] bg-background/80 px-1.5 rounded">{i === 0 ? "First frame" : `Ref ${i}`}</span>
                      </div>
                    ))}
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="aspect-square rounded-lg border-2 border-dashed grid place-items-center hover:border-primary hover:bg-accent/40 transition-all"
                    >
                      <div className="text-center">
                        <Upload className="h-5 w-5 mx-auto text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground mt-1 block">Upload</span>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Audio & Realism">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="audio" className="cursor-pointer">Generate with audio</Label>
                <p className="text-xs text-muted-foreground">Add ambient audio to the generated clip (Z.ai cogvideox supports audio).</p>
              </div>
              <Switch id="audio" checked={withAudio} onCheckedChange={setWithAudio} />
            </div>
            <div className="flex items-center justify-between pt-3 mt-3 border-t">
              <div>
                <Label htmlFor="realism" className="cursor-pointer">Realism boost</Label>
                <p className="text-xs text-muted-foreground">Injects photorealistic, 8K, natural lighting, lifelike textures and professional cinematography into the prompt.</p>
              </div>
              <Switch id="realism" checked={realismBoost} onCheckedChange={setRealismBoost} />
            </div>
          </SectionCard>

          <SectionCard
            title="Advanced parameters"
            description="Size, duration, fps & quality. Off by default — some models reject these (code 1214). Enable only if you know the model supports them."
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <Label className="cursor-pointer">Send advanced parameters</Label>
                <p className="text-xs text-muted-foreground">When off, the model uses its own defaults for a reliable generation.</p>
              </div>
              <Switch checked={advanced} onCheckedChange={setAdvanced} />
            </div>
            <div className={`grid sm:grid-cols-2 gap-4 transition-opacity ${advanced ? "" : "opacity-40 pointer-events-none"}`}>
              <div className="space-y-2">
                <Label>Aspect ratio / size</Label>
                <Select value={size} onValueChange={setSize}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASPECT_SIZES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duration (seconds)</Label>
                <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => <SelectItem key={d} value={String(d)}>{d}s</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quality</Label>
                <Select value={quality} onValueChange={(v) => setQuality(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quality">Quality (slower)</SelectItem>
                    <SelectItem value="speed">Speed (faster)</SelectItem>
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
            </div>
          </SectionCard>

          <Button onClick={generate} disabled={submitting} size="lg" className="w-full gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {submitting ? "Submitting…" : "Generate Video"}
          </Button>
        </div>

        {/* Right: jobs */}
        <div className="lg:col-span-2">
          <SectionCard
            title="Your generations"
            description="Latest video jobs and results."
            actions={
              jobs.some((j) => j.status === "failed" || j.status === "expired") ? (
                <Button variant="ghost" size="sm" onClick={cleanupFailed} className="gap-1.5 text-xs">
                  <Trash2 className="h-3.5 w-3.5" /> Clean up failed
                </Button>
              ) : undefined
            }
          >
            {jobs.length === 0 ? (
              <EmptyState
                icon={<Film className="h-6 w-6" />}
                title="No videos yet"
                description="Your generated videos will appear here with live progress."
              />
            ) : (
              <div className="space-y-3 max-h-[640px] overflow-y-auto scrollbar-thin pr-1">
                {jobs.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    onRetry={() => pollJob(job.id)}
                    onEnhance={(j) => setEnhanceJob(j)}
                    onExtend={async () => {
                      setMode("extend");
                      setExtendVideo({ url: job.resultUrl, name: job.prompt?.slice(0, 40) || "Video" });
                      setExtendFrame(null);
                      setPrompt("");
                      // Auto-extract the last frame immediately — no manual button click needed
                      setExtracting(true);
                      toast.info("Extracting last frame from video…");
                      const r = await api<{ asset: { url: string } }>("/api/video/extend", {
                        method: "POST",
                        body: JSON.stringify({ videoUrl: job.resultUrl }),
                      });
                      setExtracting(false);
                      if (r.ok && r.data?.asset?.url) {
                        setExtendFrame(r.data.asset.url);
                        toast.success("Last frame extracted! Write what happens next, then Generate.");
                      } else {
                        toast.error(r.error || "Could not extract last frame.");
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Enhance dialog */}
      <Dialog open={!!enhanceJob} onOpenChange={(o) => !o && setEnhanceJob(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Enhance Video Quality</DialogTitle>
            <DialogDescription>
              Apply professional post-processing to close the quality gap with Google Flow. Uses FFmpeg filters for motion blur, frame interpolation, color grading, and more.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs space-y-1">
              <p className="font-semibold text-primary">What this fixes:</p>
              <ul className="text-muted-foreground space-y-0.5 ml-3 list-disc">
                <li><strong>Motion blur</strong> — adds natural blur to moving elements (fixes the "AI frame" look)</li>
                <li><strong>Frame interpolation</strong> — smooths motion between AI-generated frames</li>
                <li><strong>Color grading</strong> — harmonizes palette for a professional look</li>
                <li><strong>Sharpening</strong> — enhances detail without artifacts</li>
                <li><strong>Audio normalization</strong> — evens out audio levels</li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer">Motion blur</Label>
                <Switch checked={enhanceOpts.motionBlur} onCheckedChange={(v) => setEnhanceOpts(p => ({ ...p, motionBlur: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer">Frame interpolation (smooth motion)</Label>
                <Switch checked={enhanceOpts.interpolate} onCheckedChange={(v) => setEnhanceOpts(p => ({ ...p, interpolate: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer">Sharpening</Label>
                <Switch checked={enhanceOpts.sharpen} onCheckedChange={(v) => setEnhanceOpts(p => ({ ...p, sharpen: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer">Stabilization (reduces jitter)</Label>
                <Switch checked={enhanceOpts.stabilize} onCheckedChange={(v) => setEnhanceOpts(p => ({ ...p, stabilize: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer">Audio normalization</Label>
                <Switch checked={enhanceOpts.audioNormalize} onCheckedChange={(v) => setEnhanceOpts(p => ({ ...p, audioNormalize: v }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Color grade</Label>
              <Select value={enhanceOpts.colorGrade} onValueChange={(v) => setEnhanceOpts(p => ({ ...p, colorGrade: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="vibrant">Vibrant (kid-friendly, punchy)</SelectItem>
                  <SelectItem value="cinematic">Cinematic (teal-orange)</SelectItem>
                  <SelectItem value="warm">Warm (golden hour)</SelectItem>
                  <SelectItem value="cool">Cool (blue-tinted)</SelectItem>
                  <SelectItem value="vintage">Vintage film</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEnhanceJob(null)}>Cancel</Button>
              <Button onClick={runEnhance} disabled={enhancing} className="gap-2">
                {enhancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {enhancing ? "Enhancing…" : "Enhance Video"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  async function cleanupFailed() {
    const r = await api("/api/jobs/cleanup", { method: "POST", body: JSON.stringify({ type: "video" }) });
    if (r.ok) {
      toast.success(`Removed ${r.data.removed} failed job(s)`);
      refreshJobs();
    } else {
      toast.error(r.error || "Cleanup failed");
    }
  }

  async function runEnhance() {
    if (!enhanceJob?.resultUrl) return;
    setEnhancing(true);
    toast.info("Enhancing video — this takes 30-60s…");
    const r = await api<{ asset: any }>("/api/video/enhance", {
      method: "POST",
      body: JSON.stringify({ videoUrl: enhanceJob.resultUrl, ...enhanceOpts }),
    });
    setEnhancing(false);
    if (r.ok && r.data?.asset) {
      toast.success("Video enhanced! Check your Asset Library.");
      setEnhanceJob(null);
      refreshJobs();
    } else {
      toast.error(r.error || "Enhancement failed.");
    }
  }
}

function JobRow({ job, onRetry, onExtend, onEnhance }: { job: any; onRetry: () => void; onExtend?: () => void; onEnhance?: (job: any) => void }) {
  const isProcessing = ["waiting", "submitted", "processing"].includes(job.status);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-lg border bg-card overflow-hidden"
    >
      <div className="aspect-video bg-muted relative">
        {job.status === "completed" && job.resultUrl ? (
          <video src={job.resultUrl} controls className="h-full w-full object-cover" />
        ) : job.status === "completed" ? (
          <a href={job.resultUrl} target="_blank" className="absolute inset-0 grid place-items-center text-sm text-primary">
            Open video
          </a>
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            {isProcessing ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">
                  {job.status === "waiting" ? "Submitting to Z.ai…" : `${job.status} · ${job.progress || 0}%`}
                </span>
              </div>
            ) : (
              <span className="text-xs text-red-500">{job.error || "Failed"}</span>
            )}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <Badge variant={job.status === "completed" ? "default" : "secondary"} className="text-[10px]">
            {job.status === "completed" && <CheckCircle2 className="h-3 w-3 mr-1" />}
            {job.status}
          </Badge>
          <span className="text-xs text-muted-foreground">{timeAgo(job.createdAt)}</span>
        </div>
        <p className="text-sm mt-1.5 line-clamp-2">{job.prompt || "Image to video"}</p>
        {isProcessing && <Progress value={job.progress || 5} className="h-1.5 mt-2" />}
        <div className="flex gap-2 mt-2 flex-wrap">
          {job.status === "completed" && job.resultUrl && (
            <Button size="sm" variant="outline" asChild className="h-7 gap-1.5">
              <a href={job.resultUrl} download><Download className="h-3.5 w-3.5" /> Download</a>
            </Button>
          )}
          {job.status === "completed" && job.resultUrl && onExtend && (
            <Button size="sm" variant="default" onClick={onExtend} className="h-7 gap-1.5">
              <Wand2 className="h-3.5 w-3.5" /> Extend
            </Button>
          )}
          {job.status === "completed" && job.resultUrl && onEnhance && (
            <Button size="sm" variant="outline" onClick={() => onEnhance(job)} className="h-7 gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Enhance
            </Button>
          )}
          {isProcessing && (
            <Button size="sm" variant="ghost" onClick={onRetry} className="h-7 gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
