import { spawn } from "node:child_process";
import { access, mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const serverEntry = path.join(standaloneRoot, "server.js");

// The standalone server runs from .next/standalone, where the project .env
// file is not present. Load it before spawning the server so webhook secrets
// and other runtime-only configuration survive a normal process restart.
try {
  process.loadEnvFile(path.join(projectRoot, ".env"));
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
}

async function linkRuntimeDirectory(source, target) {
  await access(source);
  await mkdir(path.dirname(target), { recursive: true });
  await rm(target, { recursive: true, force: true });
  await symlink(
    source,
    target,
    process.platform === "win32" ? "junction" : "dir",
  );
}

await linkRuntimeDirectory(
  path.join(projectRoot, "public"),
  path.join(standaloneRoot, "public"),
);
await linkRuntimeDirectory(
  path.join(projectRoot, ".next", "static"),
  path.join(standaloneRoot, ".next", "static"),
);

const server = spawn(process.execPath, [serverEntry], {
  env: {
    ...process.env,
    // Nginx is the public ingress; do not expose the application port directly.
    HOSTNAME: process.env.WEB_BIND_HOST || "127.0.0.1",
    PORT: process.env.PORT || "4000",
  },
  stdio: "inherit",
});

function stop(signal) {
  if (!server.killed) {
    server.kill(signal);
  }
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
server.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
