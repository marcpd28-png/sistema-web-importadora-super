import { spawn } from "node:child_process";
import { access, mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const serverEntry = path.join(standaloneRoot, "server.js");

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
    HOSTNAME: process.env.HOSTNAME || "0.0.0.0",
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
