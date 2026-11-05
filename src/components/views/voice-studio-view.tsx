"use client";
import { useEffect, useRef, useState } from "react";
import { PageHeader, SectionCard, EmptyState } from "@/components/shared";
import { api, fileToBase64, timeAgo } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Mic, Loader2, Sparkles, Upload, Download, Copy, AudioLines, FileAudio, X, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const MAX_CHARS = 1024;

interface Voice { id: string; label: string }
interface Asset {
  id: string;
  name: string;
  url: string;
  type: string;
  createdAt: string;
  meta?: string | null;
}

export function VoiceStudioView() {
  const [text, setText] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voice, setVoice] = useState("tongtong");
  const [speed, setSpeed] = useState(1);
  const [format, setFormat] = useState<"mp3" | "wav">("wav");
  const [submitting, setSubmitting] = useState(false);
  const [audios, setAudios] = useState<Asset[]>([]);

  // ASR state
  const [asrFile, setAsrFile] = useState<{ url: string; base64: string; name: string } | null>(null);
  const [asrBusy, setAsrBusy] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const asrRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await api<{ voices: Voice[] }>("/api/ai/tts");
      if (!cancelled && r.ok && r.data?.voices) {
        setVoices(r.data.voices);
        if (r.data.voices[0]) setVoice(r.data.voices[0].id);
      }
      const ar = await api<{ assets: Asset[] }>("/api/assets?type=audio&limit=20");
      if (!cancelled && ar.ok && ar.data) setAudios(ar.data.assets);
    })();
    return () => { cancelled = true; };
  }, []);

  const overLimit = text.length > MAX_CHARS;

  async function generate() {
    if (!text.trim()) {
      toast.error("Please enter some text.");
      return;
    }
    if (overLimit) {
      toast.error("Text exceeds the 1024-character limit.");
      return;
    }
    setSubmitting(true);
    const r = await api<{ asset: Asset }>("/api/ai/tts", {
      method: "POST",
      body: JSON.stringify({ text: text.trim(), voice, speed, format }),
    });
    setSubmitting(false);
    if (!r.ok || !r.data) {
      toast.error(r.error || "Voiceover generation failed.");
      return;
    }
    toast.success("Voiceover generated!");
    setText("");
    setAudios((p) => [r.data!.asset, ...p]);
  }

  async function onPickAsr(file: File | undefined) {
    if (!file) return;
    const base64 = await fileToBase64(file);
    const url = URL.createObjectURL(file);
    setAsrFile({ url, base64, name: file.name });
    setTranscript("");
  }

  async function runAsr() {
    if (!asrFile) {
      toast.error("Upload an audio file first.");
      return;
    }
    setAsrBusy(true);
    const r = await api<{ transcript: string }>("/api/ai/asr", {
      method: "POST",
      body: JSON.stringify({ fileBase64: asrFile.base64 }),
    });
    setAsrBusy(false);
    if (!r.ok || !r.data) {
      toast.error(r.error || "Transcription failed.");
      return;
    }
    setTranscript(r.data.transcript);
    toast.success("Transcript ready!");
  }

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(transcript);
      toast.success("Transcript copied!");
    } catch {
      toast.error("Could not copy.");
    }
  }

  return (
    <div>
      <PageHeader
        title="AI Voice Studio"
        description="Turn scripts into natural multilingual voiceovers, or transcribe existing audio with speech-to-text. Powered by Z.ai."
        icon={<Mic className="h-5 w-5" />}
      />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* TTS */}
        <SectionCard title="Text to speech" description="Generate a voiceover from your script.">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Script</Label>
                <span className={`text-xs ${overLimit ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                  {text.length} / {MAX_CHARS}
                </span>
              </div>
              <Textarea
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Welcome to VortexAI Studio — where your ideas become cinematic videos in minutes…"
              />
              {overLimit && (
                <div className="flex items-center gap-1.5 text-xs text-red-500">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Text exceeds the 1024-character limit. Please shorten it.
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Voice</Label>
                <Select value={voice} onValueChange={setVoice}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {voices.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                    ))}
                    {voices.length === 0 && (
                      <SelectItem value="tongtong">Tongtong — Warm & friendly</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={format} onValueChange={(v) => setFormat(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wav">WAV (recommended)</SelectItem>
                    <SelectItem value="mp3" disabled>MP3 (not supported by Z.ai)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Speed</Label>
                <span className="text-xs text-muted-foreground">{speed.toFixed(1)}×</span>
              </div>
              <Slider
                min={0.5}
                max={2}
                step={0.1}
                value={[speed]}
                onValueChange={(v) => setSpeed(v[0])}
              />
            </div>

            <Button
              onClick={generate}
              disabled={submitting || overLimit || !text.trim()}
              size="lg"
              className="w-full gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}
              {submitting ? "Generating…" : "Generate Voiceover"}
            </Button>
          </div>
        </SectionCard>

        {/* Recent audio */}
        <SectionCard title="Recent voiceovers" description="Your latest generated audio.">
          {audios.length === 0 ? (
            <EmptyState
              icon={<FileAudio className="h-6 w-6" />}
              title="No audio yet"
              description="Generated voiceovers will appear here, ready to play or download."
            />
          ) : (
            <div className="space-y-3 max-h-[520px] overflow-y-auto scrollbar-thin pr-1">
              {audios.map((a, i) => (
                <AudioRow key={a.id} asset={a} index={i} />
              ))}
            </div>
          )}
        </SectionCard>

        {/* ASR */}
        <SectionCard
          title="Audio transcription (ASR)"
          description="Upload an audio file to convert speech into editable text."
          className="lg:col-span-2"
        >
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <input
                ref={asrRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => onPickAsr(e.target.files?.[0])}
              />
              {asrFile ? (
                <div className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileAudio className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm truncate">{asrFile.name}</span>
                    </div>
                    <button
                      onClick={() => { setAsrFile(null); setTranscript(""); }}
                      className="grid place-items-center h-7 w-7 rounded-md hover:bg-accent"
                      aria-label="Remove file"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <audio src={asrFile.url} controls className="w-full h-9" />
                  <Button onClick={runAsr} disabled={asrBusy} className="w-full gap-2">
                    {asrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {asrBusy ? "Transcribing…" : "Transcribe Audio"}
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => asrRef.current?.click()}
                  className="w-full rounded-lg border-2 border-dashed p-8 grid place-items-center hover:border-primary hover:bg-accent/40 transition-all"
                >
                  <div className="text-center">
                    <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                    <span className="text-sm font-medium mt-2 block">Upload audio file</span>
                    <span className="text-xs text-muted-foreground mt-0.5 block">MP3, WAV, M4A — speech-to-text</span>
                  </div>
                </button>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Transcript</Label>
                {transcript && (
                  <Button variant="ghost" size="sm" onClick={copyTranscript} className="h-7 gap-1.5 text-xs">
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                )}
              </div>
              <div className="rounded-lg border bg-muted/30 p-4 min-h-[160px] text-sm leading-relaxed">
                {transcript ? (
                  transcript
                ) : (
                  <span className="text-muted-foreground">
                    Your transcript will appear here after transcription completes.
                  </span>
                )}
              </div>
              {transcript && (
                <Badge variant="secondary" className="text-[10px]">{transcript.length} characters</Badge>
              )}
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function AudioRow({ asset, index }: { asset: Asset; index: number }) {
  let snippet = "";
  try {
    if (asset.meta) {
      const m = JSON.parse(asset.meta);
      snippet = m?.text || "";
    }
  } catch {
    snippet = asset.name;
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      className="rounded-lg border bg-card p-3"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{asset.name}</p>
          <p className="text-xs text-muted-foreground">{timeAgo(asset.createdAt)}</p>
        </div>
        <a
          href={asset.url}
          download={asset.name}
          className="grid place-items-center h-7 w-7 rounded-md hover:bg-accent text-muted-foreground hover:text-primary transition-colors shrink-0"
          aria-label="Download audio"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>
      <audio src={asset.url} controls className="w-full h-9" />
      {snippet && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2 italic">“{snippet}”</p>
      )}
    </motion.div>
  );
}
