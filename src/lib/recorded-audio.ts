import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);

/** Chromium records WebM/Opus; WhatsApp requires an OGG/Opus container. */
export async function convertRecordedAudio(buffer: Buffer) {
  if (!ffmpegPath) throw new Error("La conversión de audio no está disponible en este servidor.");
  const directory = await mkdtemp(path.join(tmpdir(), "chat-audio-"));
  try {
    const input = path.join(directory, "recording.webm");
    const output = path.join(directory, "recording.ogg");
    await writeFile(input, buffer);
    await run(ffmpegPath, ["-nostdin", "-hide_banner", "-loglevel", "error", "-protocol_whitelist", "file,pipe", "-f", "matroska", "-i", input,
      "-map", "0:a:0", "-vn", "-t", "300", "-ac", "1", "-c:a", "libopus", "-b:a", "64k", "-f", "ogg", output],
    { timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true });
    return await readFile(output);
  } catch {
    throw new Error("No se pudo preparar la grabación. Intenta grabar el audio nuevamente.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
