import { loadEnvConfig } from "@next/env";
import {
  FacturadorApiError,
  FacturadorClient,
  getFacturadorConfig,
} from "../src/lib/facturador/client";
import {
  ErpSyncAlreadyRunningError,
  syncFacturadorProducts,
  type FacturadorSyncMode,
} from "../src/lib/facturador/sync";
import { refreshErpProductImages } from "../src/lib/product-image-refresh";
import { prisma } from "../src/lib/prisma";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

loadEnvConfig(process.cwd());

type SchedulerConfig = {
  enabled: boolean;
  fullComplete: boolean;
  runOnStart: boolean;
  timeZone: string;
  stockEveryMinutes: number;
  stockPriceEveryMinutes: number;
  fullEveryMinutes: number;
  windowPages: number;
  throttleCooldownMinutes: number;
  imageBatchSize: number;
  imageConcurrency: number;
};

type SchedulerState = {
  stockPage: number;
  stockPricePage: number;
  fullPage: number;
  imageCursorCode: string | null;
  lastKnownPage: number | null;
  lastPageProbedAt: number | null;
  cooldownUntil: number | null;
};

type SchedulerMode = FacturadorSyncMode | null;

const STATE_FILE = join(process.cwd(), ".erp-sync-scheduler-state.json");

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

function parseIntervalMinutes(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);

  if (Number.isInteger(parsed) && parsed >= 0) {
    return parsed;
  }

  return fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function getSchedulerConfig(): SchedulerConfig {
  return {
    enabled: parseBoolean(process.env.ERP_SYNC_SCHEDULER_ENABLED, true),
    fullComplete: parseBoolean(process.env.ERP_SYNC_FULL_COMPLETE, false),
    runOnStart: parseBoolean(process.env.ERP_SYNC_SCHEDULER_RUN_ON_START, false),
    timeZone: process.env.ERP_SYNC_SCHEDULER_TIME_ZONE?.trim() || "America/Lima",
    stockEveryMinutes: parseIntervalMinutes(process.env.ERP_SYNC_STOCK_EVERY_MINUTES, 1),
    stockPriceEveryMinutes: parseIntervalMinutes(process.env.ERP_SYNC_PRICE_EVERY_MINUTES, 1),
    fullEveryMinutes: parseIntervalMinutes(process.env.ERP_SYNC_FULL_EVERY_MINUTES, 60),
    windowPages: parsePositiveInt(process.env.ERP_SYNC_WINDOW_PAGES, 10),
    throttleCooldownMinutes: parsePositiveInt(
      process.env.ERP_SYNC_THROTTLE_COOLDOWN_MINUTES,
      10,
    ),
    imageBatchSize: parsePositiveInt(process.env.ERP_IMAGE_CHECK_BATCH_SIZE, 100),
    imageConcurrency: parsePositiveInt(process.env.ERP_IMAGE_CHECK_CONCURRENCY, 10),
  };
}

function defaultState(): SchedulerState {
  return {
    stockPage: 1,
    stockPricePage: 1,
    fullPage: 1,
    imageCursorCode: null,
    lastKnownPage: null,
    lastPageProbedAt: null,
    cooldownUntil: null,
  };
}

async function loadSchedulerState() {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<SchedulerState>;

    return {
      ...defaultState(),
      ...parsed,
      stockPage: parsePositiveInt(String(parsed.stockPage ?? 1), 1),
      stockPricePage: parsePositiveInt(String(parsed.stockPricePage ?? 1), 1),
      fullPage: parsePositiveInt(String(parsed.fullPage ?? 1), 1),
      imageCursorCode:
        typeof parsed.imageCursorCode === "string" && parsed.imageCursorCode
          ? parsed.imageCursorCode
          : null,
      lastKnownPage:
        parsed.lastKnownPage === null || parsed.lastKnownPage === undefined
          ? null
          : Number(parsed.lastKnownPage),
      lastPageProbedAt:
        parsed.lastPageProbedAt === null || parsed.lastPageProbedAt === undefined
          ? null
          : Number(parsed.lastPageProbedAt),
      cooldownUntil:
        parsed.cooldownUntil === null || parsed.cooldownUntil === undefined
          ? null
          : Number(parsed.cooldownUntil),
    } satisfies SchedulerState;
  } catch {
    return defaultState();
  }
}

async function saveSchedulerState(state: SchedulerState) {
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

function getTimePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);

  return {
    hour,
    minute,
    totalMinutes: hour * 60 + minute,
  };
}

function resolveDueMode(config: SchedulerConfig, date: Date): SchedulerMode {
  const { totalMinutes } = getTimePartsInTimeZone(date, config.timeZone);

  if (config.fullEveryMinutes > 0 && totalMinutes % config.fullEveryMinutes === 0) {
    return "FULL";
  }

  if (config.stockPriceEveryMinutes > 0 && totalMinutes % config.stockPriceEveryMinutes === 0) {
    return "STOCK_PRICE";
  }

  if (config.stockEveryMinutes > 0 && totalMinutes % config.stockEveryMinutes === 0) {
    return "STOCK_ONLY";
  }

  return null;
}

function getModeLabel(mode: FacturadorSyncMode) {
  if (mode === "STOCK_ONLY") {
    return "solo stock";
  }

  if (mode === "STOCK_PRICE") {
    return "stock/precio";
  }

  if (mode === "NEW_ONLY") {
    return "solo nuevos";
  }

  if (mode === "INCREMENTAL") {
    return "incremental";
  }

  return "completa";
}

function getTickDelayMs(date: Date) {
  return 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds());
}

function isThrottleError(error: unknown) {
  return (
    error instanceof FacturadorApiError &&
    error.status === 500 &&
    /ThrottleRequests|Too Many Attempts/i.test(error.message)
  );
}

function extractLastPage(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const meta = record.meta;

  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }

  const lastPage = (meta as Record<string, unknown>).last_page;

  if (typeof lastPage === "number" && Number.isInteger(lastPage) && lastPage > 0) {
    return lastPage;
  }

  if (typeof lastPage === "string") {
    const parsed = Number(lastPage);

    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

async function probeLastPage(client: FacturadorClient) {
  const payload = await client.request("/items/records", {
    query: { page: 1 },
    retry: false,
  });

  return extractLastPage(payload);
}

function getCursorKey(mode: FacturadorSyncMode) {
  if (mode === "STOCK_PRICE") {
    return "stockPricePage" as const;
  }

  if (mode === "FULL") {
    return "fullPage" as const;
  }

  return "stockPage" as const;
}

function advanceCursor(cursor: number, windowPages: number, lastKnownPage: number | null) {
  const next = cursor + windowPages;

  if (lastKnownPage && Number.isInteger(lastKnownPage) && lastKnownPage > 0) {
    return next > lastKnownPage ? 1 : next;
  }

  return next;
}

async function runSync(
  mode: FacturadorSyncMode,
  config: SchedulerConfig,
  state: SchedulerState,
) {
  const cursorKey = getCursorKey(mode);
  const cursor = state[cursorKey];
  const baseConfig = getFacturadorConfig();
  const baseClient = new FacturadorClient(baseConfig);

  let lastKnownPage = state.lastKnownPage;

  const shouldProbeLastPage =
    !lastKnownPage ||
    !state.lastPageProbedAt ||
    Date.now() - state.lastPageProbedAt >= 6 * 60 * 60 * 1000;

  if (shouldProbeLastPage) {
    try {
      const probedLastPage = await probeLastPage(baseClient);
      if (probedLastPage) {
        lastKnownPage = probedLastPage;
        state.lastPageProbedAt = Date.now();
      }
    } catch (error) {
      if (isThrottleError(error)) {
        state.cooldownUntil = Date.now() + config.throttleCooldownMinutes * 60_000;
        await saveSchedulerState(state);
        console.error(
          `[ERP scheduler] Throttle detectado al sondear la página 1. Enfriando durante ${config.throttleCooldownMinutes} minutos.`,
        );
        return;
      }

      throw error;
    }
  }

  const pageWindow = Math.max(1, config.windowPages);
  const runCompleteFull = mode === "FULL" && config.fullComplete;
  const effectiveClient = runCompleteFull
    ? new FacturadorClient({
        ...baseConfig,
        startProductPage: 1,
        maxProductPages: null,
      })
    : new FacturadorClient({
        ...baseConfig,
        startProductPage: cursor,
        maxProductPages: pageWindow,
        productPageConcurrency: 1,
        productPageDelayMs: 2000,
        maxRetries: 3,
        retryDelayMs: 10_000,
      });

  const startedAt = new Date();
  console.log(
    runCompleteFull
      ? `[ERP scheduler] Iniciando sync completa total desde página 1${lastKnownPage ? ` de ${lastKnownPage}` : ""} a las ${startedAt.toISOString()}`
      : `[ERP scheduler] Iniciando sync ${getModeLabel(mode)} en página ${cursor}${lastKnownPage ? ` de ${lastKnownPage}` : ""} a las ${startedAt.toISOString()}`,
  );

  try {
    const summary = await syncFacturadorProducts({
      client: effectiveClient,
      trigger: "AUTOMATIC",
      syncMode: mode,
    });

    state[cursorKey] = runCompleteFull
      ? 1
      : advanceCursor(cursor, pageWindow, lastKnownPage);
    state.lastKnownPage = lastKnownPage;
    state.cooldownUntil = null;
    await saveSchedulerState(state);

    console.log(
      `[ERP scheduler] Sync ${getModeLabel(mode)} completada. Recibidos=${summary.fetched} Creados=${summary.created} Actualizados=${summary.updated} Omitidos=${summary.skipped.length}`,
    );
  } catch (error) {
    if (error instanceof ErpSyncAlreadyRunningError) {
      console.log(`[ERP scheduler] Sync ${getModeLabel(mode)} omitida: ya había una ejecución en curso.`);
      return;
    }

    if (error instanceof FacturadorApiError) {
      if (isThrottleError(error)) {
        state.cooldownUntil = Date.now() + config.throttleCooldownMinutes * 60_000;
        await saveSchedulerState(state);
        console.error(
          `[ERP scheduler] Throttle detectado. Enfriando durante ${config.throttleCooldownMinutes} minutos.`,
        );
      }

      console.error(
        `[ERP scheduler] ERP respondió HTTP ${error.status} durante sync ${getModeLabel(mode)}:`,
        error.message,
      );
      return;
    }

    console.error(`[ERP scheduler] Error en sync ${getModeLabel(mode)}:`, error);
  }
}

async function runImageRefresh(
  config: SchedulerConfig,
  state: SchedulerState,
) {
  try {
    const result = await refreshErpProductImages({
      afterCode: state.imageCursorCode,
      batchSize: config.imageBatchSize,
      concurrency: config.imageConcurrency,
    });
    state.imageCursorCode = result.nextCursor;
    await saveSchedulerState(state);

    console.log(
      `[ERP scheduler] Imágenes verificadas=${result.checked} Actualizadas=${result.refreshed} Metadatos=${result.metadataUpdated} Errores=${result.errors}`,
    );
  } catch (error) {
    console.error("[ERP scheduler] Error al verificar imágenes:", error);
  }
}

async function main() {
  const config = getSchedulerConfig();
  const state = await loadSchedulerState();

  if (!config.enabled) {
    console.log("[ERP scheduler] Deshabilitado por ERP_SYNC_SCHEDULER_ENABLED=0");
    await prisma.$disconnect();
    return;
  }

  let stopped = false;
  const stop = async () => {
    if (stopped) {
      return;
    }

    stopped = true;
    console.log("[ERP scheduler] Deteniendo...");
    await prisma.$disconnect();
    process.exit(0);
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  if (config.runOnStart) {
    const initialMode = resolveDueMode(config, new Date());
    if (initialMode) {
      await runSync(initialMode, config, state);
    }
  }

  while (!stopped) {
    const now = new Date();
    const cooldownActive = state.cooldownUntil && Date.now() < state.cooldownUntil;
    const mode = cooldownActive ? null : resolveDueMode(config, now);

    if (cooldownActive) {
      const remainingMinutes = Math.max(1, Math.ceil((state.cooldownUntil! - Date.now()) / 60_000));
      console.log(
        `[ERP scheduler] Enfriamiento activo. Próximo intento en ~${remainingMinutes} minuto(s).`,
      );
    }

    if (mode) {
      await runSync(mode, config, state);
    } else {
      console.log("[ERP scheduler] Sin modo due para este minuto; esperando siguiente tick.");
    }

    await runImageRefresh(config, state);
    await sleep(getTickDelayMs(new Date()));
    state.cooldownUntil = state.cooldownUntil && Date.now() < state.cooldownUntil ? state.cooldownUntil : null;
  }
}

main().catch(async (error) => {
  console.error("[ERP scheduler] Error fatal:", error);
  await prisma.$disconnect();
  process.exit(1);
});
