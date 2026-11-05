"use client";
import { useEffect, useRef, useState } from "react";
import { PageHeader, SectionCard, EmptyState } from "@/components/shared";
import { api } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Clapperboard, Wand2, Loader2, Sparkles, Film, RefreshCw, CheckCircle2,
  Image as ImageIcon, Mic, Video, Pause, Play, Save, Edit3, ChevronRight,
  AlertCircle, RotateCcw, Lightbulb,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Stage = 1 | 2 | 3 | 4;

interface DirectorScene {
  index: number;
  heading: string;
  narration: string;
  imagePrompt: string;
  videoPrompt: string;
  duration: number;
  voiceover: string;
}

interface DirectorPlan {
  title: string;
  logline: string;
  style: string;
  totalDuration: number;
  scenes: DirectorScene[];
}

type AssetStatus = "pending" | "processing" | "done" | "error";

interface SceneState extends DirectorScene {
  imageStatus: AssetStatus;
  imageUrl: string | null;
  audioStatus: AssetStatus;
  audioUrl: string | null;
  videoStatus: AssetStatus;
  videoUrl: string | null;
  jobId: string | null;
  jobStatus: string | null;
  progress: number;
  error: string | null;
}

const STYLE_PRESETS = [
  { id: "Cinematic", hint: "Cinematic look, 35mm film grain, dramatic lighting, shallow depth of field, anamorphic lens flares." },
  { id: "Product Ad", hint: "Product advertising style, clean studio lighting, hero shot, premium product reveal, soft reflections." },
  { id: "Social Media", hint: "Vertical social media style, fast cuts, vibrant colors, punchy captions, energetic pacing." },
  { id: "Documentary", hint: "Documentary style, naturalistic lighting, observational camera, handheld realism, authentic mood." },
  { id: "Story", hint: "Narrative storytelling style, emotive close-ups, slow build, rich character moments." },
  { id: "Tutorial", hint: "Tutorial / explainer style, clear steps, well-lit screen-friendly framing, minimal distractions." },
];

const STAGE_DEFS = [
  { id: 1, label: "Concept", icon: Lightbulb },
  { id: 2, label: "Plan & Script", icon: Edit3 },
  { id: 3, label: "Asset Generation", icon: Clapperboard },
  { id: 4, label: "Assemble & Review", icon: Film },
] as const;

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function AiDirectorView() {
  const { setView } = useApp();
  const [stage, setStage] = useState<Stage>(1);
  const [concept, setConcept] = useState("");
  const [activeStyle, setActiveStyle] = useState<string>("Cinematic");
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<DirectorPlan | null>(null);
  const [scenes, setScenes] = useState<SceneState[]>([]);
  const [generating, setGenerating] = useState(false);
  const [selectedSceneIdx, setSelectedSceneIdx] = useState(0);
  const [savingProject, setSavingProject] = useState(false);

  const pauseRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const cancelledRef = useRef(false);

  /* -------------------- Stage 1 → 2 : plan -------------------- */
  async function handleDirect() {
    if (!concept.trim()) {
      toast.error("Describe your video concept first.");
      return;
    }
    setPlanning(true);
    const hint = STYLE_PRESETS.find((s) => s.id === activeStyle)?.hint || "";
    const fullPrompt = hint ? `${concept.trim()}\n\nStyle direction: ${hint}` : concept.trim();
    // ASYNC: POST returns a job immediately, then we poll until done.
    const r = await api<any>("/api/ai/text", {
      method: "POST",
      body: JSON.stringify({ prompt: fullPrompt, mode: "director-plan", json: true }),
    });
    if (!r.ok || !r.data?.job) {
      setPlanning(false);
      toast.error(r.error || "Could not produce a plan. Try again.");
      return;
    }
    const jobId = r.data.job.id;
    const poll = setInterval(async () => {
      const pr = await api<any>(`/api/ai/text?id=${encodeURIComponent(jobId)}`);
      if (pr.ok && pr.data?.job) {
        const j = pr.data.job;
        if (j.status === "completed" && j.resultMeta) {
          clearInterval(poll);
          setPlanning(false);
          const meta = JSON.parse(j.resultMeta);
          const p = meta.json as DirectorPlan;
          if (!p.scenes || p.scenes.length === 0) {
            toast.error("Plan returned no scenes. Try rephrasing your concept.");
            return;
          }
          setPlan(p);
          setScenes(
            p.scenes.map((s) => ({
              ...s,
              imageStatus: "pending",
              imageUrl: null,
              audioStatus: "pending",
              audioUrl: null,
              videoStatus: "pending",
              videoUrl: null,
              jobId: null,
              jobStatus: null,
              progress: 0,
              error: null,
            })),
          );
          toast.success(`"${p.title}" — ${p.scenes.length} scenes ready.`);
          setStage(2);
        } else if (j.status === "failed" || j.status === "expired") {
          clearInterval(poll);
          setPlanning(false);
          toast.error(j.error || "Could not produce a plan. Try again.");
        }
      }
    }, 3000);
    setTimeout(() => { clearInterval(poll); setPlanning(false); }, 120000);
  }

  function regeneratePlan() {
    setStage(1);
    setPlan(null);
    setScenes([]);
  }

  function updateSceneField(idx: number, field: keyof SceneState, value: any) {
    setScenes((prev) => prev.map((s) => (s.index === idx ? { ...s, [field]: value } : s)));
  }

  /* -------------------- Stage 2 → 3 : generate -------------------- */
  async function runPipeline() {
    setStage(3);
    setGenerating(true);
    pauseRef.current = false;
    cancelledRef.current = false;
    setPaused(false);
    toast.info("Production pipeline started — processing scenes sequentially.");

    // Process scenes sequentially. Submitted video jobs are polled in the background.
    for (let i = 0; i < scenes.length; i++) {
      if (cancelledRef.current) break;
      // Respect pause
      while (pauseRef.current && !cancelledRef.current) {
        await sleep(500);
      }
      if (cancelledRef.current) break;

      const scene = scenes[i];
      // Skip scenes that already have a completed video (resume case)
      if (scene.videoStatus === "done" && scene.videoUrl) {
        continue;
      }

      const okScene = await processScene(scene);
      if (!okScene) {
        toast.error(`Scene ${scene.index + 1} failed: ${scene.error || "unknown error"}. Pipeline paused — retry or proceed manually.`);
        setGenerating(false);
        return;
      }
    }

    setGenerating(false);
    if (!cancelledRef.current) {
      toast.success("All scenes processed. Review your filmstrip!");
    }
  }

  async function processScene(scene: SceneState): Promise<boolean> {
    const idx = scene.index;

    /* ---- Image (async: submit + poll) ---- */
    setSceneStatus(idx, { imageStatus: "processing" });
    const imgSubmitR = await api<any>("/api/ai/image", {
      method: "POST",
      body: JSON.stringify({
        prompt: scene.imagePrompt,
        size: "1344x768",
        name: scene.heading || `scene-${idx + 1}`,
      }),
    });
    if (!imgSubmitR.ok || !imgSubmitR.data?.job?.id) {
      setSceneStatus(idx, { imageStatus: "error", error: imgSubmitR.error || "Image generation failed" });
      return false;
    }
    // Poll until the image job completes
    const imgJobId = imgSubmitR.data.job.id;
    const imgResult = await new Promise<{ ok: boolean; url?: string; error?: string }>((resolve) => {
      const poll = setInterval(async () => {
        const pr = await api<any>(`/api/ai/image?id=${encodeURIComponent(imgJobId)}`);
        if (pr.ok && pr.data?.job) {
          const j = pr.data.job;
          if (j.status === "completed" && j.resultUrl) {
            clearInterval(poll);
            resolve({ ok: true, url: j.resultUrl });
          } else if (j.status === "failed" || j.status === "expired") {
            clearInterval(poll);
            resolve({ ok: false, error: j.error || "Image generation failed" });
          }
        }
      }, 3000);
      setTimeout(() => { clearInterval(poll); resolve({ ok: false, error: "Image generation timed out" }); }, 180000);
    });
    if (!imgResult.ok || !imgResult.url) {
      setSceneStatus(idx, { imageStatus: "error", error: imgResult.error || "Image generation failed" });
      return false;
    }
    setSceneStatus(idx, { imageStatus: "done", imageUrl: imgResult.url });

    if (pauseRef.current) await waitWhilePaused();
    if (cancelledRef.current) return false;

    /* ---- Voiceover ---- */
    setSceneStatus(idx, { audioStatus: "processing" });
    const ttsText = scene.voiceover || scene.narration;
    const ttsR = await api<any>("/api/ai/tts", {
      method: "POST",
      body: JSON.stringify({
        text: ttsText,
        voice: "tongtong",
        speed: 1,
        format: "wav",
      }),
    });
    if (!ttsR.ok || !ttsR.data?.asset?.url) {
      setSceneStatus(idx, { audioStatus: "error", error: ttsR.error || "Voiceover failed" });
      return false;
    }
    setSceneStatus(idx, { audioStatus: "done", audioUrl: ttsR.data.asset.url });

    if (pauseRef.current) await waitWhilePaused();
    if (cancelledRef.current) return false;

    /* ---- Video submit ---- */
    setSceneStatus(idx, { videoStatus: "processing", progress: 5 });
    const vidR = await api<any>("/api/ai/video", {
      method: "POST",
      body: JSON.stringify({
        prompt: scene.videoPrompt,
        imageUrls: [imgR.data.asset.url],
        withAudio: true,
        // Minimal body for reliable cogvideox generation — advanced params
        // (size/duration/fps/quality) omitted to avoid code 1214 rejections.
        name: scene.heading || `scene-${idx + 1}`,
      }),
    });
    if (!vidR.ok || !vidR.data?.job?.id) {
      setSceneStatus(idx, { videoStatus: "error", error: vidR.error || "Video submit failed" });
      return false;
    }
    const jobId = vidR.data.job.id as string;
    setSceneStatus(idx, { jobId, jobStatus: vidR.data.job.status, progress: 10 });

    // Poll in the background; do not block next scene.
    pollVideoJob(idx, jobId);

    return true;
  }

  function pollVideoJob(idx: number, jobId: string) {
    let tries = 0;
    const interval = setInterval(async () => {
      if (cancelledRef.current) {
        clearInterval(interval);
        return;
      }
      tries++;
      const r = await api<any>(`/api/ai/video?id=${encodeURIComponent(jobId)}`);
      if (!r.ok) {
        if (tries > 120) {
          clearInterval(interval);
          setSceneStatus(idx, { videoStatus: "error", error: "Timed out polling video job." });
        }
        return;
      }
      const job = r.data?.job;
      if (!job) return;
      setSceneStatus(idx, {
        jobStatus: job.status,
        progress: typeof job.progress === "number" ? job.progress : 10,
        videoUrl: job.resultUrl || null,
      });

      if (job.status === "completed" && job.resultUrl) {
        clearInterval(interval);
        setSceneStatus(idx, { videoStatus: "done", videoUrl: job.resultUrl, progress: 100 });
        maybeAdvanceToReview();
      } else if (job.status === "failed" || job.status === "expired") {
        clearInterval(interval);
        setSceneStatus(idx, { videoStatus: "error", error: job.error || "Video generation failed" });
      }
      if (tries > 120) {
        clearInterval(interval);
      }
    }, 5000);
  }

  function maybeAdvanceToReview() {
    setScenes((prev) => {
      const allDone = prev.length > 0 && prev.every((s) => s.videoStatus === "done" && s.videoUrl);
      if (allDone) {
        // Defer stage change outside the updater
        setTimeout(() => {
          setStage(4);
          setSelectedSceneIdx(0);
          setGenerating(false);
          toast.success("All scenes complete — ready to review & assemble.");
        }, 0);
      }
      return prev;
    });
  }

  async function retryScene(idx: number) {
    setSceneStatus(idx, {
      imageStatus: "pending",
      imageUrl: null,
      audioStatus: "pending",
      audioUrl: null,
      videoStatus: "pending",
      videoUrl: null,
      jobId: null,
      jobStatus: null,
      progress: 0,
      error: null,
    });
    const scene = scenes.find((s) => s.index === idx);
    if (!scene) return;
    toast.info(`Retrying scene ${idx + 1}…`);
    const ok = await processScene({ ...scene, imageStatus: "pending", imageUrl: null, audioStatus: "pending", audioUrl: null, videoStatus: "pending", videoUrl: null, jobId: null, jobStatus: null, progress: 0, error: null });
    if (ok) toast.success(`Scene ${idx + 1} re-submitted.`);
  }

  function setSceneStatus(idx: number, patch: Partial<SceneState>) {
    setScenes((prev) => prev.map((s) => (s.index === idx ? { ...s, ...patch } : s)));
  }

  async function waitWhilePaused() {
    while (pauseRef.current && !cancelledRef.current) {
      await sleep(400);
    }
  }

  function togglePause() {
    pauseRef.current = !pauseRef.current;
    setPaused(pauseRef.current);
    if (pauseRef.current) toast.info("Pipeline paused after current step.");
    else toast.info("Pipeline resumed.");
  }

  function stopPipeline() {
    cancelledRef.current = true;
    pauseRef.current = false;
    setPaused(false);
    setGenerating(false);
    toast.info("Pipeline stopped.");
  }

  /* -------------------- Stage 4 : save project -------------------- */
  async function saveProject() {
    if (!plan) return;
    setSavingProject(true);
    const r = await api<any>("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name: plan.title,
        type: "director",
        config: {
          plan,
          scenes: scenes.map((s) => ({
            index: s.index,
            heading: s.heading,
            narration: s.narration,
            imagePrompt: s.imagePrompt,
            videoPrompt: s.videoPrompt,
            duration: s.duration,
            voiceover: s.voiceover,
            imageUrl: s.imageUrl,
            audioUrl: s.audioUrl,
            videoUrl: s.videoUrl,
            jobId: s.jobId,
          })),
        },
      }),
    });
    setSavingProject(false);
    if (!r.ok) {
      toast.error(r.error || "Failed to save project.");
      return;
    }
    toast.success("Project saved to your library.");
  }

  /* -------------------- Derived -------------------- */
  const completedCount = scenes.filter((s) => s.videoStatus === "done").length;
  const overallPct = scenes.length
    ? Math.round((scenes.reduce((acc, s) => acc + (s.progress || 0), 0) / (scenes.length * 100)) * 100)
    : 0;
  const allVideosDone = scenes.length > 0 && completedCount === scenes.length;

  // Auto-advance to stage 4 once everything is done
  useEffect(() => {
    if (stage === 3 && allVideosDone && !generating) {
      setStage(4);
      setSelectedSceneIdx(0);
    }
  }, [stage, allVideosDone, generating]);

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <div>
      <PageHeader
        title="AI Director"
        description="One-click video production: drop a concept, and the AI plans, scripts, generates scenes, and assembles a final cut — powered by Z.ai."
        icon={<Wand2 className="h-5 w-5" />}
        actions={
          <Button variant="outline" onClick={() => setView("video-generator")} className="gap-2">
            <Clapperboard className="h-4 w-4" /> Manual Generator
          </Button>
        }
      />

      {/* Stepper */}
      <div className="rounded-xl border bg-card p-4 mb-6">
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-thin">
          {STAGE_DEFS.map((s, i) => {
            const completed = stage > s.id;
            const current = stage === s.id;
            const Icon = s.icon;
            return (
              <div key={s.id} className="flex items-center gap-1 sm:gap-2 shrink-0">
                <div
                  className={[
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors",
                    current
                      ? "bg-primary text-primary-foreground"
                      : completed
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "grid place-items-center h-6 w-6 rounded-full text-xs font-bold",
                      current
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : completed
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    {completed ? <CheckCircle2 className="h-4 w-4" /> : s.id}
                  </div>
                  <Icon className={current ? "h-4 w-4" : "h-4 w-4 opacity-70"} />
                  <span className="text-sm font-medium hidden sm:inline">{s.label}</span>
                </div>
                {i < STAGE_DEFS.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </div>
            );
          })}
        </div>
        {stage === 3 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>Production progress · {completedCount}/{scenes.length} scenes complete</span>
              <span>{overallPct}%</span>
            </div>
            <Progress value={overallPct} className="h-1.5" />
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* ============ STAGE 1 — CONCEPT ============ */}
        {stage === 1 && (
          <motion.div
            key="stage-1"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="grid lg:grid-cols-5 gap-6"
          >
            <div className="lg:col-span-3 space-y-4">
              <SectionCard title="Your concept" description="Describe the video you want the AI Director to produce.">
                <Textarea
                  rows={6}
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  placeholder="A 30-second teaser for a futuristic electric SUV driving through a rain-soaked neon city at night, ending on a hero shot of the car under a holographic logo reveal…"
                />
                <div className="mt-4 space-y-2">
                  <div className="text-sm font-medium">Style direction</div>
                  <div className="flex flex-wrap gap-2">
                    {STYLE_PRESETS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setActiveStyle(s.id)}
                        className={[
                          "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                          activeStyle === s.id
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:border-primary/50 hover:bg-accent/40",
                        ].join(" ")}
                      >
                        {s.id}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Adds style hints to the concept before planning.
                  </p>
                </div>
              </SectionCard>

              <Button onClick={handleDirect} disabled={planning} size="lg" className="w-full gap-2">
                {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {planning ? "Directing your video…" : "Direct My Video"}
              </Button>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <SectionCard title="How it works" description="The AI Director automates the full pipeline.">
                <ol className="space-y-3 text-sm">
                  {[
                    { n: 1, t: "Plan", d: "AI writes a title, logline and shot-by-shot script with image & video prompts." },
                    { n: 2, t: "Edit", d: "Tweak any narration or prompt inline before generation begins." },
                    { n: 3, t: "Generate", d: "Per scene: reference image → voiceover → video job (polled in background)." },
                    { n: 4, t: "Assemble", d: "Preview the filmstrip, play any scene, and save the project." },
                  ].map((step) => (
                    <li key={step.n} className="flex gap-3">
                      <div className="grid place-items-center h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                        {step.n}
                      </div>
                      <div>
                        <div className="font-medium">{step.t}</div>
                        <div className="text-xs text-muted-foreground">{step.d}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </SectionCard>
              <SectionCard title="Tips" description="Get the most from your Director.">
                <ul className="space-y-2 text-xs text-muted-foreground list-disc pl-4">
                  <li>Be specific about subject, setting, and mood.</li>
                  <li>Mention desired length and tone (epic, calm, punchy…).</li>
                  <li>Pick the style preset that best matches your goal.</li>
                  <li>You can pause the pipeline between scenes anytime.</li>
                </ul>
              </SectionCard>
            </div>
          </motion.div>
        )}

        {/* ============ STAGE 2 — PLAN & SCRIPT ============ */}
        {stage === 2 && plan && (
          <motion.div
            key="stage-2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            <SectionCard>
              <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <Film className="h-3 w-3" /> {plan.style || "Cinematic"}
                    </Badge>
                    <Badge variant="outline">{plan.totalDuration ?? plan.scenes.reduce((a, s) => a + (s.duration || 0), 0)}s total</Badge>
                    <Badge variant="outline">{plan.scenes.length} scenes</Badge>
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">{plan.title}</h2>
                  <p className="text-sm text-muted-foreground italic">{plan.logline}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" onClick={regeneratePlan} className="gap-2">
                    <RefreshCw className="h-4 w-4" /> Regenerate Plan
                  </Button>
                  <Button onClick={() => setStage(3)} className="gap-2">
                    Proceed to Generation <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Scene script"
              description="Edit any narration, image prompt, or video prompt before generation. Edits save automatically."
            >
              <div className="space-y-3 max-h-[640px] overflow-y-auto scrollbar-thin pr-1">
                {scenes.map((s) => (
                  <SceneScriptCard key={s.index} scene={s} onField={updateSceneField} />
                ))}
              </div>
            </SectionCard>
          </motion.div>
        )}

        {/* ============ STAGE 3 — ASSET GENERATION ============ */}
        {stage === 3 && plan && (
          <motion.div
            key="stage-3"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            <SectionCard
              title="Production pipeline"
              description={`Generating assets for "${plan.title}" — scenes are processed sequentially to respect rate limits.`}
              actions={
                <div className="flex gap-2">
                  {generating && (
                    <Button size="sm" variant="outline" onClick={togglePause} className="gap-2">
                      {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                      {paused ? "Resume" : "Pause"}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={stopPipeline} className="gap-2 text-muted-foreground">
                    <AlertCircle className="h-3.5 w-3.5" /> Stop
                  </Button>
                </div>
              }
            >
              {!generating && completedCount === 0 && (
                <EmptyState
                  icon={<Clapperboard className="h-6 w-6" />}
                  title="Ready to produce"
                  description="Start the pipeline to generate reference images, voiceovers, and video clips for each scene."
                  action={
                    <Button onClick={runPipeline} className="gap-2">
                      <Sparkles className="h-4 w-4" /> Start production
                    </Button>
                  }
                />
              )}
              {((generating || completedCount > 0)) && (
                <div className="space-y-3 max-h-[640px] overflow-y-auto scrollbar-thin pr-1">
                  {scenes.map((s) => (
                    <ScenePipelineRow
                      key={s.index}
                      scene={s}
                      onRetry={() => retryScene(s.index)}
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            {allVideosDone && (
              <Button onClick={() => setStage(4)} size="lg" className="w-full gap-2">
                <Film className="h-4 w-4" /> Review & Assemble
              </Button>
            )}
          </motion.div>
        )}

        {/* ============ STAGE 4 — ASSEMBLE & REVIEW ============ */}
        {stage === 4 && plan && (
          <motion.div
            key="stage-4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            <SectionCard
              title="Filmstrip preview"
              description="Click any thumbnail to play it in the main preview."
            >
              <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-2">
                {scenes.map((s, i) => (
                  <button
                    key={s.index}
                    onClick={() => setSelectedSceneIdx(i)}
                    className={[
                      "shrink-0 w-40 aspect-video rounded-lg overflow-hidden border-2 transition-all relative group",
                      selectedSceneIdx === i
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border hover:border-primary/50",
                    ].join(" ")}
                  >
                    {s.videoUrl ? (
                      <video src={s.videoUrl} className="h-full w-full object-cover" muted />
                    ) : s.imageUrl ? (
                      <img src={s.imageUrl} alt={s.heading} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-muted grid place-items-center">
                        <Film className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <span className="absolute top-1 left-1 text-[10px] bg-background/90 px-1.5 rounded font-medium">
                      #{s.index + 1}
                    </span>
                    <span className="absolute bottom-1 right-1 text-[10px] bg-background/90 px-1.5 rounded">
                      {s.duration}s
                    </span>
                  </button>
                ))}
              </div>
            </SectionCard>

            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <SectionCard
                  title="Main preview"
                  description={scenes[selectedSceneIdx]?.heading}
                  actions={
                    scenes[selectedSceneIdx]?.videoUrl ? (
                      <Button size="sm" variant="outline" asChild className="gap-1.5">
                        <a href={scenes[selectedSceneIdx].videoUrl!} download>
                          <RefreshCw className="h-3.5 w-3.5" /> Download clip
                        </a>
                      </Button>
                    ) : null
                  }
                >
                  {scenes[selectedSceneIdx]?.videoUrl ? (
                    <video
                      key={scenes[selectedSceneIdx].videoUrl}
                      src={scenes[selectedSceneIdx].videoUrl}
                      controls
                      autoPlay
                      className="w-full aspect-video rounded-lg bg-black"
                    />
                  ) : (
                    <div className="w-full aspect-video rounded-lg bg-muted grid place-items-center text-muted-foreground">
                      <Film className="h-8 w-8" />
                    </div>
                  )}
                  <div className="mt-3 grid sm:grid-cols-2 gap-3">
                    {scenes[selectedSceneIdx]?.audioUrl && (
                      <div className="rounded-lg border p-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                          <Mic className="h-3.5 w-3.5" /> Voiceover
                        </div>
                        <audio src={scenes[selectedSceneIdx].audioUrl} controls className="w-full h-8" />
                      </div>
                    )}
                    {scenes[selectedSceneIdx]?.imageUrl && (
                      <div className="rounded-lg border p-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                          <ImageIcon className="h-3.5 w-3.5" /> Reference image
                        </div>
                        <img
                          src={scenes[selectedSceneIdx].imageUrl}
                          alt="reference"
                          className="w-full h-16 object-cover rounded"
                        />
                      </div>
                    )}
                  </div>
                </SectionCard>
              </div>

              <div className="space-y-4">
                <SectionCard title="Scene narration">
                  {scenes[selectedSceneIdx] && (
                    <div className="space-y-2">
                      <p className="text-sm italic text-muted-foreground">
                        "{scenes[selectedSceneIdx].narration}"
                      </p>
                      {scenes[selectedSceneIdx].voiceover && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium not-italic">VO:</span> {scenes[selectedSceneIdx].voiceover}
                        </p>
                      )}
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="Finish up">
                  <div className="space-y-3">
                    <Button onClick={saveProject} disabled={savingProject} className="w-full gap-2">
                      {savingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Project
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setView("video-editor")}
                      className="w-full gap-2"
                    >
                      <Edit3 className="h-4 w-4" /> Open in Video Editor
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setStage(1);
                        setPlan(null);
                        setScenes([]);
                        setConcept("");
                      }}
                      className="w-full gap-2 text-muted-foreground"
                    >
                      <RotateCcw className="h-4 w-4" /> Start a new production
                    </Button>
                    <p className="text-xs text-muted-foreground leading-relaxed pt-2 border-t">
                      <Sparkles className="h-3 w-3 inline mr-1" />
                      Tip: Open the Video Editor to combine all scenes into one final video with transitions.
                    </p>
                  </div>
                </SectionCard>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function SceneScriptCard({
  scene,
  onField,
}: {
  scene: SceneState;
  onField: (idx: number, field: keyof SceneState, value: any) => void;
}) {
  return (
    <div className="rounded-lg border bg-background/40 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-bold">
            {scene.index + 1}
          </span>
          <div>
            <div className="font-semibold leading-tight">{scene.heading}</div>
            <div className="text-xs text-muted-foreground">Scene {scene.index + 1}</div>
          </div>
        </div>
        <Badge variant="outline">{scene.duration}s</Badge>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Narration</div>
          <p className="text-sm italic text-foreground/90">{scene.narration}</p>
        </div>

        {scene.voiceover && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Voiceover</div>
            <p className="text-sm">{scene.voiceover}</p>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Image prompt</div>
            <Textarea
              rows={3}
              value={scene.imagePrompt}
              onChange={(e) => onField(scene.index, "imagePrompt", e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Video prompt</div>
            <Textarea
              rows={3}
              value={scene.videoPrompt}
              onChange={(e) => onField(scene.index, "videoPrompt", e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ScenePipelineRow({
  scene,
  onRetry,
}: {
  scene: SceneState;
  onRetry: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-lg border bg-card p-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        {/* Thumbnail */}
        <div className="w-full sm:w-32 aspect-video rounded-md overflow-hidden bg-muted shrink-0 relative">
          {scene.imageUrl ? (
            <img src={scene.imageUrl} alt={scene.heading} className="h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              {scene.imageStatus === "processing" ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="grid place-items-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
              {scene.index + 1}
            </span>
            <span className="font-medium truncate">{scene.heading}</span>
            <Badge variant="outline" className="text-[10px]">{scene.duration}s</Badge>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 italic">{scene.narration}</p>

          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill label="Image" status={scene.imageStatus} icon={<ImageIcon className="h-3 w-3" />} />
            <StatusPill label="Voice" status={scene.audioStatus} icon={<Mic className="h-3 w-3" />} />
            <StatusPill
              label="Video"
              status={scene.videoStatus}
              icon={<Video className="h-3 w-3" />}
              progress={scene.progress}
              jobStatus={scene.jobStatus}
            />
          </div>

          {scene.error && (
            <div className="mt-2 flex items-center gap-2 text-xs text-red-500">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="truncate">{scene.error}</span>
              <Button size="sm" variant="ghost" onClick={onRetry} className="h-6 gap-1 text-xs">
                <RotateCcw className="h-3 w-3" /> Retry
              </Button>
            </div>
          )}
        </div>

        {/* Right-side video preview */}
        <div className="w-full sm:w-28 aspect-video rounded-md overflow-hidden bg-muted shrink-0 relative">
          {scene.videoUrl ? (
            <video src={scene.videoUrl} className="h-full w-full object-cover" muted />
          ) : scene.videoStatus === "processing" ? (
            <div className="absolute inset-0 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : scene.videoStatus === "done" ? (
            <div className="absolute inset-0 grid place-items-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <Video className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function StatusPill({
  label,
  status,
  icon,
  progress,
  jobStatus,
}: {
  label: string;
  status: AssetStatus;
  icon: React.ReactNode;
  progress?: number;
  jobStatus?: string | null;
}) {
  const map: Record<AssetStatus, { cls: string; suffix: string }> = {
    pending: { cls: "bg-muted text-muted-foreground", suffix: "Pending" },
    processing: { cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", suffix: "Working" },
    done: { cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", suffix: "Done" },
    error: { cls: "bg-red-500/15 text-red-600 dark:text-red-400", suffix: "Failed" },
  };
  const v = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${v.cls}`}>
      {status === "processing" ? <Loader2 className="h-3 w-3 animate-spin" /> : status === "done" ? <CheckCircle2 className="h-3 w-3" /> : icon}
      {label}: {v.suffix}
      {status === "processing" && typeof progress === "number" && progress > 0 ? ` · ${progress}%` : ""}
      {status === "processing" && jobStatus ? ` · ${jobStatus}` : ""}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
