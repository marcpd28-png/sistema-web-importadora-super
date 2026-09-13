#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const NAME = "03 - Conversation Router V2 - STAGING";
const SOURCE_SHA = "c852e33975f2adfbfb63ef0833ce191ecd2b04b25652b106723f6c650c4da206";
const canonical = (value) => JSON.stringify(value, (_, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item);
const plan = (workflow) => ({
  nodes: workflow.nodes.map(node => {
    const copy = { ...node };
    delete copy.credentials;
    return copy;
  }),
  connections: workflow.connections,
  settings: workflow.settings,
});
const snapshot = (workflow) => canonical({
  name: workflow.name, active: workflow.active,
  activeVersionId: workflow.activeVersionId ?? null,
  versionId: workflow.versionId,
  nodes: workflow.nodes, connections: workflow.connections, settings: workflow.settings,
});

let backup, remote, container, lock;
let locked = false, attempted = false, verified = false;

function docker(args, label, input) {
  const result = spawnSync("docker", args, {
    encoding: "utf8", input, timeout: 60000, maxBuffer: 16 * 1024 * 1024,
  });
  fs.appendFileSync(path.join(backup, "commands.log"),
    `\n[${label}]\n${result.stdout ?? ""}${result.stderr ?? ""}`, { mode: 0o600 });
  if (result.error || result.status !== 0) throw new Error(`Falló: ${label}.`);
  return result.stdout;
}

function exported(label, published = false) {
  const remoteFile = `${remote}/${label}.json`;
  docker(["exec", "-u", "node", container, "n8n", "export:workflow", "--all",
    ...(published ? ["--published"] : []), `--output=${remoteFile}`], `exportar ${label}`);
  const localFile = path.join(backup, `${label}.json`);
  docker(["cp", `${container}:${remoteFile}`, localFile], `respaldar ${label}`);
  fs.chmodSync(localFile, 0o600);
  let list;
  try { list = JSON.parse(fs.readFileSync(localFile, "utf8")); }
  catch { throw new Error(`La exportación ${label} no contiene JSON válido.`); }
  if (!Array.isArray(list) || !list.length ||
      list.some(w => !w || typeof w.id !== "string" || typeof w.active !== "boolean" ||
        !Array.isArray(w.nodes) || !w.connections) ||
      new Set(list.map(w => w.id)).size !== list.length) {
    throw new Error(`La exportación ${label} no pasó la validación.`);
  }
  return list;
}

function checkDraft(workflow, source) {
  if (workflow.active !== false || workflow.activeVersionId || workflow.nodes.length !== 43 ||
      canonical(plan(workflow)) !== canonical(plan(source))) {
    throw new Error("El borrador existente o importado no coincide con Router V2 inactivo. No se sobrescribe.");
  }
}

try {
  process.umask(0o077);
  const { values } = parseArgs({ options: {
    workflow: { type: "string", default: fileURLToPath(new URL("../n8n/workflows/03-conversation-router-v2.json", import.meta.url)) },
    container: { type: "string", default: "n8n" },
    "backup-root": { type: "string", default: os.homedir() },
  } });
  container = values.container;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) throw new Error("Nombre de contenedor no válido.");
  const raw = fs.readFileSync(values.workflow, "utf8");
  if (createHash("sha256").update(raw).digest("hex") !== SOURCE_SHA) {
    throw new Error("El JSON no coincide con el Router V2 validado de la versión 4fbd981.");
  }
  const source = JSON.parse(raw);
  if (source.id || source.active !== false || source.name !== NAME || source.nodes.length !== 43) {
    throw new Error("El origen debe ser un workflow nuevo, inactivo y con 43 nodos.");
  }

  lock = path.join(values["backup-root"], `.importadora-router-v2-${container}.lock`);
  try { fs.mkdirSync(lock, { mode: 0o700 }); locked = true; }
  catch { throw new Error("No se pudo obtener el bloqueo de importación. Puede existir una ejecución pendiente de revisión."); }
  backup = fs.mkdtempSync(path.join(values["backup-root"], "importadora-n8n-backup-"));
  console.log("RESPALDO PRIVADO:", backup);
  const version = docker(["exec", "-u", "node", container, "n8n", "--version"], "comprobar versión").trim();
  if (!version.split(/\r?\n/).includes("2.38.6")) {
    throw new Error("Este comando está verificado para n8n 2.38.6. La versión instalada es diferente.");
  }
  remote = docker(["exec", "-u", "node", container, "node", "-e",
    'console.log(require("node:fs").mkdtempSync("/tmp/importadora-router-v2-"))'], "crear carpeta temporal").trim();
  if (!/^\/tmp\/importadora-router-v2-[A-Za-z0-9]+$/.test(remote)) {
    remote = undefined;
    throw new Error("No se pudo comprobar la carpeta temporal del contenedor.");
  }

  const before = exported("before");
  if (before.some(w => w.activeVersionId)) {
    const published = exported("before-published", true);
    if (before.some(w => w.activeVersionId && !published.some(p =>
      p.id === w.id && p.versionId === w.activeVersionId))) {
      throw new Error("No se pudieron respaldar todas las versiones publicadas.");
    }
  }
  const matches = before.filter(w => w.name === NAME);
  if (matches.length > 1) throw new Error("Hay varios borradores con el mismo nombre. Se requiere revisión; no se importa otro.");
  let draft = matches[0];
  if (draft) {
    checkDraft(draft, source);
    console.log("El borrador ya existe; se conserva sin importar otra copia.");
  } else {
    docker(["exec", "-i", "-u", "node", container, "node", "-e",
      'const fs=require("node:fs");fs.writeFileSync(process.argv[1],fs.readFileSync(0),{flag:"wx",mode:0o600})',
      `${remote}/router-v2.json`], "copiar Router V2", raw);
    console.log("Importando Router V2 como borrador inactivo...");
    attempted = true;
    docker(["exec", "-u", "node", container, "n8n", "import:workflow",
      `--input=${remote}/router-v2.json`, "--activeState=false"], "importar Router V2 inactivo");
    const after = exported("after");
    const oldIds = new Set(before.map(w => w.id));
    const added = after.filter(w => !oldIds.has(w.id));
    if (added.length !== 1 || after.length !== before.length + 1 || added[0].name !== NAME ||
        before.some(w => !after.some(a => a.id === w.id && snapshot(a) === snapshot(w)))) {
      throw new Error("La comprobación posterior detectó un resultado inesperado. Se conservan los respaldos para revisión.");
    }
    draft = added[0];
    checkDraft(draft, source);
  }
  verified = true;
  console.log("LISTO:", NAME);
  console.log("ID:", JSON.stringify(draft.id));
  console.log("ACTIVO: false | PUBLICADO: false | NODOS: 43");
  console.log("Pendiente: revisar credenciales, URLs y pruebas antes de publicar.");
} catch (error) {
  // Only our own validation messages are printed; filesystem/CLI details stay private.
  console.error("ERROR:", error?.code ? "No se pudo completar una operación local." : error.message);
  if (attempted && !verified) {
    console.error("Importación pendiente de revisión. Se conserva el bloqueo; no repitas ni publiques el flujo todavía.");
  }
  if (backup) console.error("Detalles y respaldo:", backup);
  process.exitCode = 1;
} finally {
  if (remote && (!attempted || verified)) {
    try { docker(["exec", "-u", "node", container, "node", "-e",
      'require("node:fs").rmSync(process.argv[1],{recursive:true,force:true})', remote], "limpiar carpeta temporal"); }
    catch { console.error("La carpeta temporal sigue en el contenedor; el respaldo permanece disponible."); }
  }
  if (locked && (!attempted || verified)) {
    try { fs.rmdirSync(lock); } catch { console.error("No se pudo retirar el bloqueo local de importación."); }
  }
}
