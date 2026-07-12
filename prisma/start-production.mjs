import { spawn } from "node:child_process";
import process from "node:process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const schedulerSetting =
  process.env.ERP_SYNC_SCHEDULER_ENABLED?.trim().toLowerCase();
const schedulerEnabled = !["0", "false", "no", "off"].includes(
  schedulerSetting ?? "",
);
const webScript = process.argv[2]?.trim() || "start:web";
const children = [];
let shuttingDown = false;

function startScript(script) {
  const child = spawn(npmCommand, ["run", script], {
    env: process.env,
    stdio: "inherit",
  });

  children.push(child);
  child.once("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const reason = signal ? `señal ${signal}` : `código ${code ?? 1}`;
    console.error(`[production] ${script} terminó (${reason}).`);
    shutdown(code ?? 1);
  });

  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  const forceTimer = setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
  }, 5_000);
  forceTimer.unref();

  Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) {
            resolve();
            return;
          }

          child.once("exit", resolve);
        }),
    ),
  ).finally(() => {
    process.exit(exitCode);
  });
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));

startScript(webScript);

if (schedulerEnabled) {
  startScript("sync:facturador-scheduler");
} else {
  console.log("[production] Scheduler ERP deshabilitado por configuración.");
}
