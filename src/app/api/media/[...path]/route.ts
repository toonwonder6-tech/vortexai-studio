import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { STORAGE_DIR, mimeFromExt } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Streams stored media files with HTTP Range request support.
 * Browsers REQUIRE 206 Partial Content responses to play <video> and <audio>
 * elements — without it, the media won't load/stream.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await params;
  const filename = parts.join("/");
  if (filename.includes("..")) return new NextResponse("Not found", { status: 404 });

  const filePath = path.join(STORAGE_DIR, filename);
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const mime = mimeFromExt(filename);
  const totalSize = stat.size;
  const rangeHeader = req.headers.get("range");

  // No Range header → serve the full file (200 OK)
  if (!rangeHeader) {
    const buffer = await fs.readFile(filePath);
    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(totalSize),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Accept-Ranges": "bytes",
      },
    });
  }

  // Parse Range header: "bytes=START-END" (END optional)
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    return new NextResponse("Invalid range", { status: 416 });
  }
  let start = match[1] ? parseInt(match[1], 10) : 0;
  let end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
  if (start >= totalSize || end >= totalSize || start > end) {
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${totalSize}` },
    });
  }
  const chunkSize = end - start + 1;

  // Read just the requested chunk
  const fd = await fs.open(filePath, "r");
  const buffer = Buffer.alloc(chunkSize);
  await fd.read(buffer, 0, chunkSize, start);
  await fd.close();

  return new NextResponse(buffer as any, {
    status: 206,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(chunkSize),
      "Content-Range": `bytes ${start}-${end}/${totalSize}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
