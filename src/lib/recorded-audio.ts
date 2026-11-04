import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);

/** Chromium records WebM/Opus; connected chat transports use OGG/Opus. */
export async function convertRecordedAudio(buffer: Buffer, format: "ogg" | "mp3" = "ogg") {
  const executable = typeof ffmpegPath === "string" && existsSync(ffmpegPath) ? ffmpegPath : "ffmpeg";
  const directory = await mkdtemp(path.join(tmpdir(), "chat-audio-"));
  try {
    const input = path.join(directory, "recording.webm");
    const output = path.join(directory, `recording.${format}`);
    await writeFile(input, buffer);
    await run(executable, ["-nostdin", "-hide_banner", "-loglevel", "error", "-protocol_whitelist", "file,pipe", "-f", "matroska", "-i", input,
      "-map", "0:a:0", "-vn", "-t", "300", "-ac", "1", "-c:a", format === "mp3" ? "libmp3lame" : "libopus", "-b:a", "64k", "-f", format, output],
    { timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true });
    return await readFile(output);
  } catch {
    throw new Error("No se pudo preparar la grabación. Intenta grabar el audio nuevamente.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
