/**
 * Shared FFmpeg helpers — used by the Video Editor render route,
 * Video Extend route, and Music Video render route.
 */
import { spawn } from "child_process";

/** Run an FFmpeg command, returning a promise that resolves on success. */
export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

/** Probe the duration of a media file in seconds. */
export function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", () => resolve(0));
    proc.on("close", () => {
      const n = parseFloat(out.trim());
      resolve(Number.isFinite(n) ? n : 0);
    });
  });
}

/** Check if a media file has an audio stream. */
export function probeHasAudio(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(
      "ffprobe",
      ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", filePath],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", () => resolve(false));
    proc.on("close", () => resolve(out.trim() === "audio"));
  });
}

/** Detect silence intervals in an audio file for beat/phrase boundary estimation.
 *  Returns an array of { start, end } for each silent region. */
export async function detectSilence(filePath: string, threshold = -30, duration = 0.5): Promise<{ start: number; end: number }[]> {
  return new Promise((resolve) => {
    const proc = spawn(
      "ffmpeg",
      ["-i", filePath, "-af", `silencedetect=n=${threshold}dB:d=${duration}`, "-f", "null", "-"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", () => resolve([]));
    proc.on("close", () => {
      const silences: { start: number; end: number }[] = [];
      let currentStart: number | null = null;
      const startMatch = /silence_start: ([\d.]+)/g;
      const endMatch = /silence_end: ([\d.]+)/g;
      let m;
      const starts: number[] = [];
      const ends: number[] = [];
      while ((m = startMatch.exec(stderr)) !== null) starts.push(parseFloat(m[1]));
      while ((m = endMatch.exec(stderr)) !== null) ends.push(parseFloat(m[1]));
      for (let i = 0; i < Math.max(starts.length, ends.length); i++) {
        const s = starts[i] ?? (i > 0 ? ends[i - 1] : 0);
        const e = ends[i] ?? s + duration;
        silences.push({ start: s, end: e });
      }
      resolve(silences);
    });
  });
}

/** Format seconds as SRT timestamp: HH:MM:SS,mmm */
export function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/** Parse SRT timestamp HH:MM:SS,mmm to seconds */
export function parseSrtTime(srt: string): number {
  const m = srt.trim().match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!m) return 0;
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 1000;
}

/** Convert lyric lines to SRT format */
export function linesToSrt(lines: { index: number; text: string; startTime?: number | null; endTime?: number | null }[]): string {
  return lines
    .filter((l) => l.startTime != null && l.endTime != null)
    .map((l, i) => {
      return `${i + 1}\n${formatSrtTime(l.startTime!)} --> ${formatSrtTime(l.endTime!)}\n${l.text}\n`;
    })
    .join("\n");
}

/** Parse SRT content into lyric line objects */
export function parseSrt(srt: string): { text: string; startTime: number; endTime: number }[] {
  const blocks = srt.trim().split(/\n\s*\n/);
  const lines: { text: string; startTime: number; endTime: number }[] = [];
  for (const block of blocks) {
    const lines_raw = block.trim().split("\n");
    if (lines_raw.length < 2) continue;
    const timeMatch = lines_raw[1].match(/([\d:,.]+)\s*-->\s*([\d:,.]+)/);
    if (!timeMatch) continue;
    const startTime = parseSrtTime(timeMatch[1]);
    const endTime = parseSrtTime(timeMatch[2]);
    const text = lines_raw.slice(2).join("\n").trim();
    if (text) lines.push({ text, startTime, endTime });
  }
  return lines;
}
