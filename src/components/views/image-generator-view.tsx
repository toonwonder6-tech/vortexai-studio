"use client";
import { useEffect, useRef, useState } from "react";
import { PageHeader, SectionCard, EmptyState } from "@/components/shared";
import { api, fileToBase64, timeAgo } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Image as ImageIcon, Wand2, Loader2, Upload, Download, Sparkles, X, Edit3, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const SIZES = [
  { label: "1:1 Square · 1024×1024", value: "1024x1024" },
  { label: "16:9 Landscape · 1344×768", value: "1344x768" },
  { label: "9:16 Portrait · 768×1344", value: "768x1344" },
  { label: "2:1 Wide · 1440×720", value: "1440x720" },
  { label: "1:2 Tall · 720×1440", value: "720x1440" },
  { label: "4:3 Classic · 1152×864", value: "1152x864" },
  { label: "3:4 Portrait · 864×1152", value: "864x1152" },
];

/** Style presets — each injects a rich style suffix into the prompt. */
const STYLE_PRESETS = [
  { id: "none", label: "No style", emoji: "🎯", suffix: "" },
  { id: "cinematic", label: "Cinematic", emoji: "🎬", suffix: "cinematic style, dramatic lighting, film grain, shallow depth of field, anamorphic lens, color graded, 35mm" },
  { id: "3d-animation", label: "3D Animation", emoji: "🧸", suffix: "Pixar-style 3D animation, soft global illumination, vibrant colors, smooth rendering, expressive characters" },
  { id: "anime", label: "Anime", emoji: "🌸", suffix: "anime style, cel-shaded, bold outlines, vibrant colors, Studio Ghibli inspired, hand-drawn aesthetic" },
  { id: "realistic", label: "Photorealistic", emoji: "📷", suffix: "photorealistic, ultra-detailed, 8K, natural lighting, lifelike textures, true-to-life colors" },
  { id: "claymation", label: "Claymation", emoji: "🪀", suffix: "claymation, clay texture, handcrafted, Wallace & Gromit style, tactile, charmingly imperfect" },
  { id: "watercolor", label: "Watercolor", emoji: "🎨", suffix: "watercolor painting, soft washes, bleeding colors, textured paper, dreamy, artistic, flowing pigments" },
  { id: "cyberpunk", label: "Cyberpunk", emoji: "🌃", suffix: "cyberpunk style, neon-lit, rain-soaked, holographic ads, Blade Runner aesthetic, high contrast, futuristic" },
  { id: "vintage", label: "Vintage Film", emoji: "📽️", suffix: "vintage 1970s film, Super 8, warm faded colors, light leaks, grain, nostalgic, retro, sepia tones" },
  { id: "noir", label: "Film Noir", emoji: "🕵️", suffix: "film noir, black and white, high contrast, dramatic shadows, venetian blind lighting, 1940s mood" },
  { id: "fantasy", label: "Fantasy", emoji: "🧙", suffix: "epic fantasy style, magical glow, ethereal atmosphere, golden hour, mythical, enchanted, sweeping" },
  { id: "low-poly", label: "Low Poly", emoji: "🔷", suffix: "low-poly 3D art, geometric facets, flat shading, minimalist, stylized, colorful, clean polygons" },
  { id: "pixel-art", label: "Pixel Art", emoji: "👾", suffix: "pixel art, 16-bit retro game style, limited palette, crisp pixels, nostalgic, SNES era, dithering" },
  { id: "product-ad", label: "Product Ad", emoji: "🛍️", suffix: "product commercial, studio lighting, clean background, macro details, premium, sleek, high-end advertising" },
  { id: "oil-painting", label: "Oil Painting", emoji: "🖌️", suffix: "oil painting, thick brushstrokes, impasto texture, rich colors, classical art, canvas texture, museum quality" },
] as const;

interface Asset {
  id: string;
  name: string;
  url: string;
  type: string;
  createdAt: string;
  meta?: string | null;
}

export function ImageGeneratorView() {
  const { setView } = useApp();
  const [mode, setMode] = useState<"generate" | "edit">("generate");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [styleId, setStyleId] = useState<string>("none");
  const [editImage, setEditImage] = useState<{ url: string; base64: string; name: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [preview, setPreview] = useState<Asset | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedStyle = STYLE_PRESETS.find((s) => s.id === styleId) || STYLE_PRESETS[0];
  const finalPrompt = selectedStyle.suffix ? `${prompt.trim()}, ${selectedStyle.suffix}` : prompt.trim();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await api<{ assets: Asset[] }>("/api/assets?type=image&limit=24");
      if (!cancelled && r.ok && r.data) setAssets(r.data.assets);
    })();
    return () => { cancelled = true; };
  }, []);

  async function refresh() {
    const r = await api<{ assets: Asset[] }>("/api/assets?type=image&limit=24");
    if (r.ok && r.data) setAssets(r.data.assets);
  }

  async function onPickEditImage(file: File | undefined) {
    if (!file) return;
    const base64 = await fileToBase64(file);
    const url = URL.createObjectURL(file);
    setEditImage({ url, base64, name: file.name });
  }

  async function improvePrompt() {
    if (!prompt.trim()) {
      toast.error("Write a prompt first.");
      return;
    }
    toast.info("Enhancing prompt…");
    const r = await api<{ result: { prompt?: string } }>("/api/ai/prompt", {
      method: "POST",
      body: JSON.stringify({ prompt, mode: "improve", style: "advertising" }),
    });
    if (r.ok && r.data?.result?.prompt) {
      setPrompt(r.data.result.prompt);
      toast.success("Prompt enhanced!");
    } else {
      toast.error("Could not enhance prompt.");
    }
  }

  async function generate() {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt.");
      return;
    }
    if (mode === "edit" && !editImage) {
      toast.error("Please upload an image to edit.");
      return;
    }
    setSubmitting(true);
    // Async pattern: POST returns a job immediately, then we poll until done.
    // This avoids gateway timeouts on long Z.ai image generation calls (~35s).
    const r = await api<{ job: any }>("/api/ai/image", {
      method: "POST",
      body: JSON.stringify({
        prompt: finalPrompt,
        size,
        mode,
        imageBase64: mode === "edit" ? editImage?.base64 : undefined,
        name: prompt.slice(0, 60) || "Image generation",
      }),
    });
    if (!r.ok || !r.data?.job) {
      setSubmitting(false);
      toast.error(r.error || "Image generation failed.");
      return;
    }
    toast.info("Generating image… this takes ~30s.");
    const jobId = r.data.job.id;
    // Poll until complete
    const poll = setInterval(async () => {
      const pr = await api<{ job: any }>(`/api/ai/image?id=${encodeURIComponent(jobId)}`);
      if (pr.ok && pr.data?.job) {
        const j = pr.data.job;
        if (j.status === "completed" && j.resultUrl) {
          clearInterval(poll);
          setSubmitting(false);
          toast.success("Image generated!");
          setPrompt("");
          // Fetch the asset to get full details, then prepend to gallery
          const ar = await api<{ assets: Asset[] }>("/api/assets?type=image&limit=1");
          if (ar.ok && ar.data?.assets?.[0]) {
            setAssets((p) => [ar.data!.assets[0], ...p]);
          } else {
            refresh();
          }
        } else if (j.status === "failed" || j.status === "expired") {
          clearInterval(poll);
          setSubmitting(false);
          toast.error(j.error || "Image generation failed.");
        }
      }
    }, 3000);
    // Safety timeout: stop after 3 minutes
    setTimeout(() => {
      clearInterval(poll);
      setSubmitting(false);
    }, 180000);
  }

  return (
    <div>
      <PageHeader
        title="AI Image Generator"
        description="Create stunning visuals from text, or edit an existing image with natural-language instructions — text-to-image and image editing powered by Z.ai."
        icon={<ImageIcon className="h-5 w-5" />}
        actions={
          <Button variant="outline" onClick={() => setView("video-generator")} className="gap-2">
            <Sparkles className="h-4 w-4" /> Use in Video
          </Button>
        }
      />

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left: controls */}
        <div className="lg:col-span-2 space-y-4">
          <SectionCard title="Generation mode">
            <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="generate" className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> Generate
                </TabsTrigger>
                <TabsTrigger value="edit" className="gap-1.5">
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="mt-4 space-y-3">
              {mode === "edit" && (
                <div className="space-y-2">
                  <Label>Source image</Label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPickEditImage(e.target.files?.[0])}
                  />
                  {editImage ? (
                    <div className="relative aspect-square rounded-lg overflow-hidden border group">
                      <img src={editImage.url} alt="" className="h-full w-full object-cover" />
                      <button
                        onClick={() => setEditImage(null)}
                        className="absolute top-1 right-1 grid place-items-center h-6 w-6 rounded-full bg-background/80"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <span className="absolute bottom-1 left-1 text-[10px] bg-background/80 px-1.5 rounded">
                        Editing source
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="w-full aspect-square rounded-lg border-2 border-dashed grid place-items-center hover:border-primary hover:bg-accent/40 transition-all"
                    >
                      <div className="text-center">
                        <Upload className="h-5 w-5 mx-auto text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground mt-1 block">Upload image to edit</span>
                      </div>
                    </button>
                  )}
                </div>
              )}

              {/* Style presets */}
              <div className="space-y-2">
                <Label>Style preset</Label>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto scrollbar-thin">
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
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Prompt</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={improvePrompt}
                    className="h-7 gap-1.5 text-xs"
                  >
                    <Wand2 className="h-3.5 w-3.5" /> Improve
                  </Button>
                </div>
                <Textarea
                  rows={5}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    mode === "edit"
                      ? "Make it sunset, add volumetric light, change the sky to a starry galaxy…"
                      : "A cinematic product shot of a glass perfume bottle on wet stone, dramatic rim light, hyper-realistic, 50mm…"
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Size / aspect ratio</Label>
                <Select value={size} onValueChange={setSize}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SIZES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SectionCard>

          <Button onClick={generate} disabled={submitting} size="lg" className="w-full gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {submitting ? "Generating…" : mode === "edit" ? "Edit Image" : "Generate Image"}
          </Button>
        </div>

        {/* Right: gallery */}
        <div className="lg:col-span-3">
          <SectionCard
            title="Gallery"
            description="Your recent AI images. Click any image for a larger preview."
            actions={
              <Button variant="ghost" size="sm" onClick={refresh} className="gap-1.5">
                Refresh
              </Button>
            }
          >
            {assets.length === 0 ? (
              <EmptyState
                icon={<ImageIcon className="h-6 w-6" />}
                title="No images yet"
                description="Your generated images will appear here. Try a prompt to get started."
              />
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[720px] overflow-y-auto scrollbar-thin pr-1">
                {assets.map((a, i) => (
                  <ImageCard key={a.id} asset={a} index={i} onPreview={() => setPreview(a)} />
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          {preview && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate">{preview.name}</DialogTitle>
                <DialogDescription>
                  Generated {timeAgo(preview.createdAt)} · {preview.url.split(".").pop()?.toUpperCase()}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg overflow-hidden border bg-muted">
                <img src={preview.url} alt={preview.name} className="w-full h-auto" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary" className="text-[10px]">AI generated</Badge>
                <Button size="sm" asChild className="gap-1.5">
                  <a href={preview.url} download={preview.name}>
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ImageCard({
  asset, index, onPreview,
}: { asset: Asset; index: number; onPreview: () => void }) {
  let promptText = "";
  try {
    if (asset.meta) {
      const m = JSON.parse(asset.meta);
      promptText = m?.prompt || "";
    }
  } catch {
    promptText = asset.name;
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="rounded-lg border bg-card overflow-hidden group"
    >
      <button
        onClick={onPreview}
        className="relative w-full aspect-square bg-muted block"
        aria-label="Preview image"
      >
        <img src={asset.url} alt={asset.name} className="h-full w-full object-cover" />
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 grid place-items-center">
          <span className="grid place-items-center h-9 w-9 rounded-full bg-background/90">
            <Eye className="h-4 w-4" />
          </span>
        </div>
      </button>
      <div className="p-2.5">
        <p className="text-xs line-clamp-2 leading-snug min-h-[2rem]">{promptText || asset.name}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-muted-foreground">{timeAgo(asset.createdAt)}</span>
          <a
            href={asset.url}
            download={asset.name}
            className="grid place-items-center h-7 w-7 rounded-md hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
            aria-label="Download image"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}
