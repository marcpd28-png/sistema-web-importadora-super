#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const NAME = "03 - Conversation Router V2 - STAGING";
const SOURCE_SHA = "c852e33975f2adfbfb63ef0833ce191ecd2b04b25652b106723f6c650c4da206";
const REVIEWED_OUTBOUND_ID = "YwSoeCWb8Joo3RAR";
const REVIEWED_OUTBOUND_NAME = "STAGING - Outbound Messaging v3 CLEAN";
const REVIEWED_OUTBOUND_FIELDS = new Set([
  "versionId", "nodes.6.position.1", "nodes.7.position.0", "nodes.7.position.1",
  "nodes.17.disabled", "nodes.17.position.1", "nodes.18.position.0", "nodes.18.position.1",
]);
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

let backup, remote, container, lock, recovery, recoveryClaim;
let locked = false, attempted = false, verified = false;

function docker(args, label, input) {
  const result = spawnSync("docker", args, {
    encoding: "utf8", input, timeout: 60000, maxBuffer: 16 * 1024 * 1024,
  });
  fs.appendFileSync(path.join(backup, "commands.log"),
    `\n[${label}]\n${result.stdout ?? ""}${result.stderr ?? ""}\nstatus=${result.status} signal=${result.signal ?? "none"} error=${result.error?.code ?? "none"}\n`, { mode: 0o600 });
  const schemaError = `${result.stdout ?? ""}${result.stderr ?? ""}`.match(
    /null value in column "[\w]+"(?: of relation "[\w]+")? violates not-null constraint|violates (?:foreign key|unique|check) constraint "[\w]+"/i,
  );
  if (schemaError) throw new Error(`Falló ${label}: ${schemaError[0]}`);
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
  return readExport(localFile, label);
}

function readExport(localFile, label) {
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

function noOtherImport() {
  const result = spawnSync("ps", ["-eo", "pid=,comm=,args="], { encoding: "utf8", timeout: 10000 });
  if (result.error || result.status !== 0) throw new Error("No se pudo comprobar si hay otra importación activa.");
  const entries = result.stdout.split(/\r?\n/)
    .map(line => line.match(/^\s*(\d+)\s+(\S+)\s+(.*)$/)).filter(Boolean);
  if (!entries.length) throw new Error("La consulta de procesos no devolvió un listado verificable.");
  const active = entries.some(match => {
    return Number(match[1]) !== process.pid && /^(node|docker|n8n|npm)$/.test(match[2]) &&
      /(?:router-v2-import-[^\s]+|import-router-v2-staging)\.mjs\b|n8n[^\n]*\bimport:workflow\b/.test(match[3]);
  });
  if (active) throw new Error("Hay otra importación activa. Se conserva el bloqueo anterior.");
}

function differencePaths(a, b, location = "") {
  if (canonical(a) === canonical(b)) return [];
  if (a && b && typeof a === "object" && typeof b === "object") {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(key =>
      differencePaths(a[key], b[key], location ? `${location}.${key}` : key));
  }
  return [location];
}

function reviewedReference(previous, file, backupRoot) {
  if (!file) return { before: previous };
  const reviewedFrom = path.resolve(file);
  const dir = path.dirname(reviewedFrom);
  if (path.basename(reviewedFrom) !== "before.json" ||
      path.dirname(dir) !== path.resolve(backupRoot) ||
      !/^importadora-n8n-backup-[A-Za-z0-9]+$/.test(path.basename(dir)) ||
      !fs.lstatSync(dir).isDirectory() || !fs.lstatSync(reviewedFrom).isFile()) {
    throw new Error("La referencia revisada debe ser before.json dentro de un respaldo local del importador.");
  }
  const before = readExport(reviewedFrom, "revisada");
  if (before.length !== previous.length || previous.some(w => !before.some(a => a.id === w.id))) {
    throw new Error("La referencia revisada agrega o elimina workflows. No se acepta automáticamente.");
  }
  const reviewedChanges = [];
  for (const old of previous) {
    const current = before.find(w => w.id === old.id);
    const fields = differencePaths(JSON.parse(snapshot(old)), JSON.parse(snapshot(current)));
    if (!fields.length) continue;
    if (old.id !== REVIEWED_OUTBOUND_ID || old.name !== REVIEWED_OUTBOUND_NAME ||
        current.name !== REVIEWED_OUTBOUND_NAME || fields.some(field => !REVIEWED_OUTBOUND_FIELDS.has(field))) {
      throw new Error("La referencia incluye cambios distintos de los revisados en Outbound v3. Se conserva el bloqueo.");
    }
    reviewedChanges.push({ id: old.id, fields });
  }
  return { before, reviewedFrom, reviewedChanges };
}

function beginRecovery(previous, backupRoot, reviewedFile) {
  const from = path.resolve(previous);
  if (path.dirname(from) !== path.resolve(backupRoot) ||
      !/^importadora-n8n-backup-[A-Za-z0-9]+$/.test(path.basename(from)) ||
      !fs.lstatSync(from).isDirectory()) {
    throw new Error("El respaldo de recuperación debe ser una carpeta directa del mismo directorio de respaldos.");
  }
  const log = fs.readFileSync(path.join(from, "commands.log"), "utf8");
  if (!/null value in column "id" of relation "workflow_entity" violates not-null constraint/i.test(log)) {
    throw new Error("La recuperación automática solo aplica al fallo confirmado por id ausente en workflow_entity.");
  }
  const before = readExport(path.join(from, "before.json"), "anterior");
  if (before.some(w => w.name === NAME)) throw new Error("El respaldo anterior ya contiene Router V2; requiere revisión.");
  const reference = reviewedReference(before, reviewedFile, backupRoot);
  noOtherImport();
  const stat = fs.lstatSync(lock);
  if (!stat.isDirectory() || fs.readdirSync(lock).length) {
    throw new Error("El bloqueo anterior no es el bloqueo vacío esperado. Se conserva para revisión.");
  }
  const claim = path.join(lock, "recovery");
  fs.mkdirSync(claim, { mode: 0o700 });
  recoveryClaim = claim;
  return { ...reference, from, stat };
}

function verifyRecovery(current) {
  if (current.length !== recovery.before.length || recovery.before.some(w =>
    !current.some(a => a.id === w.id && snapshot(a) === snapshot(w)))) {
    throw new Error("n8n cambió desde el respaldo anterior. Se conserva el bloqueo; no se importa otro flujo.");
  }
  noOtherImport();
  const stat = fs.lstatSync(lock);
  if (stat.dev !== recovery.stat.dev || stat.ino !== recovery.stat.ino) {
    throw new Error("El bloqueo cambió durante la comprobación. No se continúa.");
  }
  fs.writeFileSync(path.join(backup, "recovery.json"), JSON.stringify({
    from: recovery.from, previousLockTime: recovery.stat.mtime.toISOString(),
    reviewedFrom: recovery.reviewedFrom, reviewedChanges: recovery.reviewedChanges,
    workflowsChecked: current.length, checkedAt: new Date().toISOString(),
  }), { flag: "wx", mode: 0o600 });
  // Keep the directory continuously locked, including our recovery claim, until verification.
  locked = true;
  console.log(`Recuperación verificada: ${current.length} workflows coinciden con la referencia.`);
  if (recovery.reviewedChanges?.length) {
    console.log("Se conservan los cambios revisados de Outbound v3; su funcionamiento aún debe probarse.");
  }
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
    "recover-from": { type: "string" },
    "reviewed-before": { type: "string" },
  } });
  if (values["reviewed-before"] && !values["recover-from"]) {
    throw new Error("La referencia revisada requiere indicar el intento fallido con --recover-from.");
  }
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
  catch (error) {
    if (error.code !== "EEXIST" || !values["recover-from"]) {
      throw new Error("No se pudo obtener el bloqueo de importación. Puede existir una ejecución pendiente de revisión.");
    }
    recovery = beginRecovery(values["recover-from"], values["backup-root"], values["reviewed-before"]);
  }
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
  if (recovery) verifyRecovery(before);
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
    // n8n 2.38.6's single-file CLI import can reach workflow_entity without an ID.
    // Supply a fresh ID only in the private import payload; never reuse an existing one.
    const oldIds = new Set(before.map(w => w.id));
    let importId;
    do { importId = randomBytes(12).toString("base64url"); } while (oldIds.has(importId));
    const payload = JSON.stringify({ ...source, id: importId, active: false });
    fs.writeFileSync(path.join(backup, "prepared-workflow.json"), payload, { flag: "wx", mode: 0o600 });
    docker(["exec", "-i", "-u", "node", container, "node", "-e",
      'const fs=require("node:fs");fs.writeFileSync(process.argv[1],fs.readFileSync(0),{flag:"wx",mode:0o600})',
      `${remote}/router-v2.json`], "copiar Router V2", payload);
    console.log("Importando Router V2 como borrador inactivo...");
    attempted = true;
    docker(["exec", "-u", "node", container, "n8n", "import:workflow",
      `--input=${remote}/router-v2.json`, "--activeState=false"], "importar Router V2 inactivo");
    const after = exported("after");
    const added = after.filter(w => !oldIds.has(w.id));
    if (added.length !== 1 || after.length !== before.length + 1 ||
        added[0].id !== importId || added[0].name !== NAME ||
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
  if (recoveryClaim && (!locked || !attempted || verified)) {
    try { fs.rmdirSync(recoveryClaim); } catch { console.error("No se pudo retirar la reserva de recuperación."); }
  }
  if (locked && (!attempted || verified)) {
    try { fs.rmdirSync(lock); } catch { console.error("No se pudo retirar el bloqueo local de importación."); }
  }
}
