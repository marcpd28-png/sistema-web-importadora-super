/**
 * Read production logs without keeping VPS credentials or dependencies in the
 * repository. Uses the operating system's `ssh` client and key authentication.
 *
 * Required: VPS_HOST, VPS_USER, VPS_SSH_PRIVATE_KEY_PATH
 * Optional: VPS_PORT (defaults to 22), VPS_PROJECT_PATH (defaults to /home/IMPORTADORA)
 */
function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Configura ${name} antes de consultar los logs.`);
  return value;
}

async function main() {
  const { spawn } = await import("node:child_process");
  const host = requiredEnvironment("VPS_HOST");
  const username = requiredEnvironment("VPS_USER");
  const privateKeyPath = requiredEnvironment("VPS_SSH_PRIVATE_KEY_PATH");
  const projectPath = process.env.VPS_PROJECT_PATH?.trim() || "/home/IMPORTADORA";
  const port = Number(process.env.VPS_PORT || "22");

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("VPS_PORT debe ser un puerto válido.");
  }
  if (!/^[a-zA-Z0-9._:-]+$/.test(host) || !/^[a-z_][a-z0-9_-]*$/i.test(username)) {
    throw new Error("VPS_HOST o VPS_USER contiene caracteres no permitidos.");
  }

  const remoteCommand = `cd -- ${shellQuote(projectPath)} && pm2 logs importadora --lines 50 --nostream`;
  const child = spawn(
    "ssh",
    ["-i", privateKeyPath, "-p", String(port), "-o", "BatchMode=yes", `${username}@${host}`, remoteCommand],
    { stdio: "inherit" },
  );
  child.once("error", (error) => {
    console.error(`No se pudo ejecutar SSH: ${error.message}`);
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "No se pudieron consultar los logs del VPS.");
  process.exitCode = 1;
});
