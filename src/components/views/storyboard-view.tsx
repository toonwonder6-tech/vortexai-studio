"use client";
import { useState } from "react";
import { PageHeader, SectionCard, EmptyState } from "@/components/shared";
import { api } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Film, Loader2, Wand2, ImageIcon, Clock, Video, Camera, Move,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface Shot {
  index: number;
  scene: number;
  shotType: string;
  visualPrompt: string;
  cameraMovement: string;
  duration: number;
}
interface StoryboardJson {
  shots: Shot[];
}

export function StoryboardView() {
  const { setView } = useApp();
  const [script, setScript] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [shotImages, setShotImages] = useState<Record<number, { url: string; busy: boolean; error?: string }>>({});

  async function generate() {
    if (!script.trim()) {
      toast.error("Paste a script or describe your video first.");
      return;
    }
    setSubmitting(true);
    // ASYNC: POST returns a job immediately, then we poll until done.
    const r = await api<{ job: any }>("/api/ai/text", {
      method: "POST",
      body: JSON.stringify({ prompt: script, mode: "storyboard", json: true }),
    });
    if (!r.ok || !r.data?.job) {
      setSubmitting(false);
      toast.error(r.error || "Storyboard generation failed.");
      return;
    }
    toast.info("AI is creating your storyboard…");
    const jobId = r.data.job.id;
    const poll = setInterval(async () => {
      const pr = await api<{ job: any }>(`/api/ai/text?id=${encodeURIComponent(jobId)}`);
      if (pr.ok && pr.data?.job) {
        const j = pr.data.job;
        if (j.status === "completed" && j.resultMeta) {
          clearInterval(poll);
          setSubmitting(false);
          const meta = JSON.parse(j.resultMeta);
          if (!meta.json?.shots?.length) {
            toast.error("Could not parse storyboard. Try a more detailed script.");
            return;
          }
          setShots(meta.json.shots);
          setShotImages({});
          toast.success(`Generated ${meta.json.shots.length} shots!`);
        } else if (j.status === "failed" || j.status === "expired") {
          clearInterval(poll);
          setSubmitting(false);
          toast.error(j.error || "Storyboard generation failed.");
        }
      }
    }, 3000);
    setTimeout(() => { clearInterval(poll); setSubmitting(false); }, 120000);
  }

  async function generateShotImage(shot: Shot) {
    if (!shot.visualPrompt) {
      toast.error("This shot has no visual prompt.");
      return;
    }
    setShotImages((p) => ({ ...p, [shot.index]: { url: "", busy: true } }));
    // ASYNC: POST returns a job immediately, then we poll until done.
    const r = await api<{ job: any }>("/api/ai/image", {
      method: "POST",
      body: JSON.stringify({
        prompt: shot.visualPrompt,
        size: "1344x768",
        name: `Shot ${shot.index} — ${shot.shotType}`,
      }),
    });
    if (!r.ok || !r.data?.job) {
      setShotImages((p) => ({ ...p, [shot.index]: { url: "", busy: false, error: r.error || "Failed" } }));
      toast.error(r.error || "Image generation failed for this shot.");
      return;
    }
    const jobId = r.data.job.id;
    const poll = setInterval(async () => {
      const pr = await api<{ job: any }>(`/api/ai/image?id=${encodeURIComponent(jobId)}`);
      if (pr.ok && pr.data?.job) {
        const j = pr.data.job;
        if (j.status === "completed" && j.resultUrl) {
          clearInterval(poll);
          setShotImages((p) => ({ ...p, [shot.index]: { url: j.resultUrl, busy: false } }));
          toast.success(`Shot ${shot.index} image ready!`);
        } else if (j.status === "failed" || j.status === "expired") {
          clearInterval(poll);
          setShotImages((p) => ({ ...p, [shot.index]: { url: "", busy: false, error: j.error || "Failed" } }));
          toast.error(j.error || `Shot ${shot.index} image failed.`);
        }
      }
    }, 3000);
    setTimeout(() => { clearInterval(poll); }, 180000);
  }

  return (
    <div>
      <PageHeader
        title="AI Storyboard"
        description="Convert any script or concept into a shot-by-shot storyboard — then preview each shot as an AI image and send it to the video generator."
        icon={<Film className="h-5 w-5" />}
      />

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left: input */}
        <div className="lg:col-span-2 space-y-4">
          <SectionCard title="Script / concept">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Paste your script or describe your video</Label>
                <Textarea
                  rows={10}
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="Open on a wide shot of a misty mountain ridge at dawn. Cut to a close-up of a runner lacing up trail shoes. Tracking shot as the runner sprints along a cliff edge…"
                />
              </div>
            </div>
          </SectionCard>

          <Button onClick={generate} disabled={submitting} size="lg" className="w-full gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {submitting ? "Building storyboard…" : "Generate Storyboard"}
          </Button>
        </div>

        {/* Right: timeline */}
        <div className="lg:col-span-3">
          <SectionCard
            title="Shot timeline"
            description={shots.length ? `${shots.length} shots planned` : undefined}
          >
            {shots.length === 0 ? (
              <EmptyState
                icon={<Film className="h-6 w-6" />}
                title="No storyboard yet"
                description="Generate a shot-by-shot plan from your script. Each shot gets its own card you can preview as an image."
              />
            ) : (
              <div className="relative pl-6 max-h-[760px] overflow-y-auto scrollbar-thin pr-1">
                {/* vertical rail */}
                <div className="absolute left-[14px] top-2 bottom-2 w-px bg-border" />
                <div className="space-y-3">
                  {shots.map((s, i) => (
                    <ShotCard
                      key={s.index ?? i}
                      shot={s}
                      index={i}
                      state={shotImages[s.index]}
                      onGenerateImage={() => generateShotImage(s)}
                      onGenerateVideo={() => setView("video-generator")}
                    />
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function ShotCard({
  shot, index, state, onGenerateImage, onGenerateVideo,
}: {
  shot: Shot;
  index: number;
  state?: { url: string; busy: boolean; error?: string };
  onGenerateImage: () => void;
  onGenerateVideo: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4) }}
      className="relative"
    >
      {/* rail node */}
      <div className="absolute -left-[19px] top-5 grid place-items-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold ring-4 ring-background">
        {shot.index ?? index + 1}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Camera className="h-3 w-3" /> {shot.shotType || "Shot"}
          </Badge>
          {shot.cameraMovement && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Move className="h-3 w-3" /> {shot.cameraMovement}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] gap-1">
            <Clock className="h-3 w-3" /> {shot.duration}s
          </Badge>
          {shot.scene ? (
            <Badge variant="outline" className="text-[10px]">Scene {shot.scene}</Badge>
          ) : null}
        </div>

        <p className="text-sm leading-relaxed">{shot.visualPrompt}</p>

        {/* generated image preview */}
        {state?.url && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-lg overflow-hidden border bg-muted aspect-video relative group"
          >
            <img src={state.url} alt={shot.visualPrompt} className="h-full w-full object-cover" />
            <a
              href={state.url}
              download={`shot-${shot.index}.png`}
              className="absolute top-2 right-2 grid place-items-center h-7 w-7 rounded-md bg-background/90 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Download shot image"
            >
              <ImageIcon className="h-3.5 w-3.5" />
            </a>
          </motion.div>
        )}
        {state?.busy && (
          <div className="mt-3 rounded-lg border bg-muted aspect-video grid place-items-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Generating image…</span>
            </div>
          </div>
        )}
        {state?.error && (
          <p className="text-xs text-red-500 mt-2">{state.error}</p>
        )}

        <div className="flex flex-wrap gap-2 mt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={onGenerateImage}
            disabled={state?.busy}
            className="h-7 gap-1.5"
          >
            {state?.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
            {state?.url ? "Regenerate image" : "Generate image"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onGenerateVideo}
            className="h-7 gap-1.5"
          >
            <Video className="h-3.5 w-3.5" /> Generate video
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
