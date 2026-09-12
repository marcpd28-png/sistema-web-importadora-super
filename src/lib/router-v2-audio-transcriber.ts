export type RouterV2AudioTranscription =
  | {
      status: "READY";
      text: string;
      model: string;
    }
  | {
      status: "NOT_CONFIGURED";
      text: null;
    }
  | {
      status: "INVALID_AUDIO";
      text: null;
      reason: string;
    }
  | {
      status: "PROVIDER_ERROR";
      text: null;
      reason: string;
    };

type DataUrlAudio = {
  mimeType: string;
  bytes: Uint8Array;
  extension: string;
};

type TranscriptionPayload = {
  text?: string;
  error?: {
    message?: string;
  };
};

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

function extensionForMime(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("opus")) return "opus";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("webm")) return "webm";
  return "bin";
}

export function parseRouterV2AudioDataUrl(
  value: string,
): DataUrlAudio | null {
  const match = value
    .trim()
    .match(/^data:(audio\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i);

  if (!match) return null;

  try {
    const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
    if (buffer.length === 0 || buffer.length > MAX_AUDIO_BYTES) return null;

    return {
      mimeType: match[1],
      bytes: new Uint8Array(buffer),
      extension: extensionForMime(match[1]),
    };
  } catch {
    return null;
  }
}

function copyToArrayBuffer(bytes: Uint8Array) {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return arrayBuffer;
}

export async function transcribeRouterV2Audio(input: {
  audioDataUrl: string;
  language?: string | null;
}): Promise<RouterV2AudioTranscription> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { status: "NOT_CONFIGURED", text: null };
  }

  const audio = parseRouterV2AudioDataUrl(input.audioDataUrl);
  if (!audio) {
    return {
      status: "INVALID_AUDIO",
      text: null,
      reason: "Expected a supported base64 audio data URL under 20 MB",
    };
  }

  const model =
    process.env.ROUTER_V2_TRANSCRIBE_MODEL?.trim() ||
    "gpt-4o-mini-transcribe";

  const form = new FormData();
  const blob = new Blob([copyToArrayBuffer(audio.bytes)], {
    type: audio.mimeType,
  });
  form.append("file", blob, `voice-note.${audio.extension}`);
  form.append("model", model);

  const language = input.language?.trim();
  if (language) form.append("language", language.slice(0, 20));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
        signal: controller.signal,
      },
    );

    let payload: TranscriptionPayload = {};
    try {
      payload = (await response.json()) as TranscriptionPayload;
    } catch {
      return {
        status: "PROVIDER_ERROR",
        text: null,
        reason: `Transcription provider returned HTTP ${response.status} without JSON`,
      };
    }

    if (!response.ok) {
      return {
        status: "PROVIDER_ERROR",
        text: null,
        reason:
          payload.error?.message?.slice(0, 300) ||
          `Transcription provider returned HTTP ${response.status}`,
      };
    }

    const text = payload.text?.trim() ?? "";
    if (!text) {
      return {
        status: "PROVIDER_ERROR",
        text: null,
        reason: "Transcription provider returned empty text",
      };
    }

    return {
      status: "READY",
      text: text.slice(0, 10_000),
      model,
    };
  } catch (error: unknown) {
    return {
      status: "PROVIDER_ERROR",
      text: null,
      reason:
        error instanceof Error
          ? error.message.slice(0, 300)
          : "Unknown transcription error",
    };
  } finally {
    clearTimeout(timeout);
  }
}
