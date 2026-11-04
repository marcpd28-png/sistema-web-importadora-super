import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { test } from "node:test";
import ffmpegPath from "ffmpeg-static";
import { prepareMessagingUpload } from "./messaging-upload";

test("convierte una grabación WebM real en OGG Opus para mensajería", async () => {
  const executable = typeof ffmpegPath === "string" && existsSync(ffmpegPath) ? ffmpegPath : "ffmpeg";
  const { stdout } = await promisify(execFile)(executable, ["-nostdin", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=0.3", "-c:a", "libopus", "-f", "webm", "pipe:1"],
  { encoding: "buffer", windowsHide: true });
  const result = await prepareMessagingUpload(stdout, "audio/webm;codecs=opus");
  assert.equal(result.extension, ".ogg");
  assert.equal(result.buffer.subarray(0, 4).toString(), "OggS");
  assert.ok(result.buffer.subarray(0, 1024).includes(Buffer.from("OpusHead")));
});

test("rechaza grabaciones dañadas y grabaciones demasiado grandes", async () => {
  await assert.rejects(prepareMessagingUpload(Buffer.from("invalid"), "audio/webm"), /No se pudo preparar/);
  await assert.rejects(prepareMessagingUpload(Buffer.alloc(26 * 1024 * 1024), "audio/webm"), /25 MB/);
});
