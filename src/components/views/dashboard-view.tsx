"use client";
import { useEffect, useState } from "react";
import { PageHeader, StatCard, SectionCard, EmptyState } from "@/components/shared";
import { api, formatBytes, timeAgo } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Clapperboard, Film, Image as ImageIcon, Mic, FolderOpen, HardDrive,
  CheckCircle2, Loader2, Sparkles, Wand2, ArrowRight, Activity, Download,
} from "lucide-react";
import { motion } from "framer-motion";

interface DashData {
  stats: {
    projects: number;
    jobs: number;
    assets: number;
    videoCount: number;
    imageCount: number;
    audioCount: number;
    completedJobs: number;
    processingJobs: number;
    storageBytes: number;
    storageLimitBytes: number;
  };
  limits: any;
  daily: { video: number; image: number; text: number; audio: number };
  recentJobs: any[];
  recentActivity: any[];
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  processing: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  submitted: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  waiting: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  expired: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export function DashboardView() {
  const { user, setView } = useApp();
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewJob, setPreviewJob] = useState<any>(null);

  useEffect(() => {
    api("/api/dashboard").then((r) => {
      if (r.ok) setData(r.data as any);
      setLoading(false);
    });
  }, []);

  const storagePct = data
    ? Math.min(100, Math.round((data.stats.storageBytes / (data.stats.storageLimitBytes || 1)) * 100))
    : 0;

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.name || user?.email?.split("@")[0]}`}
        description="Your free AI video production studio. Generate, direct, edit and publish — all powered by Z.ai."
        icon={<Sparkles className="h-5 w-5" />}
        actions={
          <Button onClick={() => setView("ai-director")} className="gap-2">
            <Wand2 className="h-4 w-4" /> Open AI Director
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Projects" value={data?.stats.projects ?? "—"} icon={<FolderOpen className="h-4 w-4" />} accent="primary" hint="All-time created" />
        <StatCard label="Videos generated" value={data?.stats.videoCount ?? "—"} icon={<Film className="h-4 w-4" />} accent="chart-2" hint={`${data?.stats.completedJobs ?? 0} jobs completed`} />
        <StatCard label="Images & assets" value={data?.stats.assets ?? "—"} icon={<ImageIcon className="h-4 w-4" />} accent="chart-3" hint={`${data?.stats.imageCount ?? 0} images`} />
        <StatCard label="In progress" value={data?.stats.processingJobs ?? "—"} icon={<Loader2 className="h-4 w-4" />} accent="chart-4" hint="Active generation jobs" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Quick start */}
        <SectionCard title="Quick start" description="Jump straight into a creative workflow." className="lg:col-span-2">
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { id: "video-generator", icon: Clapperboard, title: "AI Video Generator", desc: "Text-to-video & image-to-video with the Z.ai video engine." },
              { id: "image-generator", icon: ImageIcon, title: "AI Image Generator", desc: "Generate and edit reference images in seconds." },
              { id: "ai-director", icon: Wand2, title: "AI Director", desc: "One click: concept → script → scenes → video.", badge: "Signature" },
              { id: "voice-studio", icon: Mic, title: "AI Voice Studio", desc: "Natural multilingual voiceovers from text." },
            ].map((q) => (
              <button
                key={q.id}
                onClick={() => setView(q.id as any)}
                className="group text-left rounded-xl border p-4 hover:border-primary/50 hover:bg-accent/40 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="grid place-items-center h-9 w-9 rounded-lg bg-primary/10 text-primary">
                    <q.icon className="h-4 w-4" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">{q.title}</h4>
                  {q.badge && <Badge variant="secondary" className="text-[10px]">{q.badge}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{q.desc}</p>
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Usage & storage */}
        <SectionCard title="Fair-use & storage" description="Free platform — reasonable limits protect everyone.">
          <div className="space-y-4">
            <UsageBar label="Daily video" used={data?.daily.video ?? 0} limit={data?.limits.dailyVideoLimit ?? 0} />
            <UsageBar label="Daily images" used={data?.daily.image ?? 0} limit={data?.limits.dailyImageLimit ?? 0} />
            <UsageBar label="Daily text" used={data?.daily.text ?? 0} limit={data?.limits.dailyTextLimit ?? 0} />
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <HardDrive className="h-4 w-4" /> Storage
                </span>
                <span className="font-medium">
                  {formatBytes(data?.stats.storageBytes ?? 0)} / {data?.limits.storageLimitMb ?? 0} MB
                </span>
              </div>
              <Progress value={storagePct} className="h-2" />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Recent jobs */}
      <SectionCard
        title="Recent generations"
        description="Your latest AI jobs across the studio."
        className="mt-6"
        actions={<Button variant="ghost" size="sm" onClick={() => setView("projects")}>View all</Button>}
      >
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : data?.recentJobs?.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 min-w-0">
            {data.recentJobs.map((job) => (
              <JobCard key={job.id} job={job} onOpen={(j) => setPreviewJob(j)} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Clapperboard className="h-6 w-6" />}
            title="No generations yet"
            description="Create your first AI video, image, or voiceover to see it here."
            action={<Button onClick={() => setView("video-generator")} className="gap-2"><Sparkles className="h-4 w-4" /> Start creating</Button>}
          />
        )}
      </SectionCard>

      {/* Preview dialog for completed jobs */}
      <Dialog open={!!previewJob} onOpenChange={(o) => !o && setPreviewJob(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
          {previewJob && (
            <>
              <DialogHeader className="pr-10">
                <DialogTitle className="line-clamp-2 leading-snug">{previewJob.prompt?.slice(0, 120) || `${previewJob.type} generation`}</DialogTitle>
                <DialogDescription>{timeAgo(previewJob.createdAt)} · {previewJob.type}</DialogDescription>
              </DialogHeader>
              <div className="rounded-lg overflow-hidden border bg-black">
                {previewJob.type === "video" && (
                  <video src={previewJob.resultUrl} controls autoPlay className="w-full max-h-[55vh]" />
                )}
                {previewJob.type === "image" && (
                  <img src={previewJob.resultUrl} alt="" className="w-full max-h-[55vh] object-contain" />
                )}
                {previewJob.type === "audio" && (
                  <div className="p-8 grid place-items-center">
                    <Mic className="h-12 w-12 text-muted-foreground mb-4" />
                    <audio src={previewJob.resultUrl} controls autoPlay className="w-full" />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" asChild className="gap-1.5">
                  <a href={previewJob.resultUrl} download><Download className="h-3.5 w-3.5" /> Download</a>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{used} / {limit}</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}

export function JobCard({ job, onOpen }: { job: any; onOpen?: (job: any) => void }) {
  const typeIcon: Record<string, any> = {
    video: Film,
    image: ImageIcon,
    audio: Mic,
    text: Sparkles,
  };
  const Icon = typeIcon[job.type] || Activity;
  const isProcessing = ["waiting", "submitted", "processing"].includes(job.status);
  const hasResult = job.resultUrl && job.status === "completed";

  return (
    <motion.div whileHover={{ y: -2 }} className="rounded-lg border bg-card overflow-hidden flex flex-col">
      <button
        onClick={() => hasResult && onOpen?.(job)}
        disabled={!hasResult}
        className="aspect-video bg-muted relative block w-full text-left disabled:cursor-default"
      >
        {hasResult && job.type === "video" ? (
          <video src={job.resultUrl} className="h-full w-full object-cover" muted preload="metadata" playsInline
            onError={(e) => { (e.target as HTMLVideoElement).style.display = "none"; }}
          />
        ) : hasResult && job.type === "image" ? (
          <img src={job.resultUrl} alt="" className="h-full w-full object-cover" loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : hasResult && job.type === "audio" ? (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-primary/10 to-chart-2/10">
            <Mic className="h-8 w-8 text-primary" />
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            {isProcessing ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-[10px] text-muted-foreground">{job.progress || 0}%</span>
              </div>
            ) : job.status === "failed" || job.status === "expired" ? (
              <div className="flex flex-col items-center gap-1">
                <Icon className="h-6 w-6 text-red-400" />
                <span className="text-[10px] text-red-500">Failed</span>
              </div>
            ) : (
              <Icon className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
        )}
        {/* Play overlay for completed videos */}
        {hasResult && job.type === "video" && (
          <div className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
            <div className="grid place-items-center h-10 w-10 rounded-full bg-background/90">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-primary ml-0.5"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        )}
        {/* Type badge (bottom-left) */}
        <div className="absolute bottom-2 left-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-background/80 backdrop-blur-sm flex items-center gap-1">
            <Icon className="h-2.5 w-2.5" />
            {job.type}
          </span>
        </div>
        {/* Status badge (top-right) */}
        <div className="absolute top-2 right-2">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[job.status] || ""} shadow-sm`}>
            {job.status}
          </span>
        </div>
      </button>
      <div className="p-3 flex-1 flex flex-col">
        <p className="text-sm font-medium line-clamp-2 leading-snug flex-1">{job.prompt || `${job.type} generation`}</p>
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-xs text-muted-foreground">{timeAgo(job.createdAt)}</p>
          {hasResult && (
            <a
              href={job.resultUrl}
              download
              className="text-[10px] text-primary hover:underline flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="h-3 w-3" /> Download
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
