import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./import-router-v2-staging.mjs", import.meta.url));
const workflowFile = fileURLToPath(new URL("../n8n/workflows/03-conversation-router-v2.json", import.meta.url));
const source = JSON.parse(fs.readFileSync(workflowFile, "utf8"));
const CANARY = "FAKE_SECRET_MUST_NOT_APPEAR_IN_TERMINAL";

// Exercise the real subprocess interface without connecting to Docker or a database.
function fakeDocker(fs, path) {
  const root = process.env.ROUTER_IMPORT_TEST_ROOT;
  const args = process.argv.slice(2);
  const stateFile = path.join(root, "state.json");
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const remoteFile = value => path.join(root, "container", path.basename(value));
  const save = () => fs.writeFileSync(stateFile, JSON.stringify(state));
  if (args[0] === "cp") {
    fs.copyFileSync(remoteFile(args[1]), args[2]);
    process.exit(0);
  }
  const command = args.slice(args.indexOf("n8n") + 1);
  if (command[0] === "node") {
    const code = command[2];
    if (code.includes("mkdtempSync")) {
      fs.mkdirSync(path.join(root, "container"), { recursive: true });
      console.log("/tmp/importadora-router-v2-Test01");
    } else if (code.includes("writeFileSync")) {
      fs.writeFileSync(remoteFile(command[3]), fs.readFileSync(0));
    }
    process.exit(0);
  }
  console.log("FAKE_SECRET_MUST_NOT_APPEAR_IN_TERMINAL");
  if (command[1] === "--version") {
    console.log("2.38.6");
  } else if (command[1] === "export:workflow") {
    const output = command.find(a => a.startsWith("--output=")).slice(9);
    const records = command.includes("--published")
      ? state.workflows.filter(w => w.activeVersionId).map(w => ({ ...w, versionId: w.activeVersionId }))
      : state.workflows;
    fs.writeFileSync(remoteFile(output), state.mode === "malformed"
      ? "{FAKE_SECRET_MUST_NOT_APPEAR_IN_TERMINAL" : JSON.stringify(records));
  } else if (command[1] === "import:workflow") {
    state.imports++;
    state.flags = command;
    const input = command.find(a => a.startsWith("--input=")).slice(8);
    const imported = JSON.parse(fs.readFileSync(remoteFile(input), "utf8"));
    if (imported.id || imported.active !== false || !command.includes("--activeState=false")) {
      throw new Error("Unsafe import request");
    }
    if (state.mode !== "silent-failure") {
      const active = state.mode === "unexpected-active";
      state.workflows.push({ ...imported, id: "newRouter", versionId: "newVersion",
        active, activeVersionId: active ? "newVersion" : null,
        nodes: imported.nodes.map(node => node.credentials ? {
          ...node, credentials: Object.fromEntries(Object.entries(node.credentials)
            .map(([type, credential]) => [type, { ...credential, id: "resolvedCredential" }]))
        } : node),
      });
      if (state.mode === "changed-existing") state.workflows[0].nodes[0].parameters.changed = true;
    }
    save();
  } else throw new Error("Unexpected Docker call");
}

function fixture(t, mode = "ok", extra = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "router-import-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "docker"), `#!/usr/bin/env node\n(${fakeDocker.toString()})(require("node:fs"),require("node:path"));\n`, { mode: 0o755 });
  const current = { id: "production", name: "01 - Incoming Messages", active: true,
    versionId: "draftVersion", activeVersionId: "publishedVersion",
    nodes: [{ id: "existingNode", parameters: { secret: CANARY } }], connections: {}, settings: {},
  };
  const stateFile = path.join(root, "state.json");
  fs.writeFileSync(stateFile, JSON.stringify({ imports: 0, mode, workflows: [current, ...extra] }));
  return {
    root, current,
    state: () => JSON.parse(fs.readFileSync(stateFile, "utf8")),
    run: (file = workflowFile) => spawnSync(process.execPath,
      [script, "--workflow", file, "--container", "n8n", "--backup-root", root], {
        encoding: "utf8", timeout: 15000,
        env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, ROUTER_IMPORT_TEST_ROOT: root },
      }),
  };
}

test("imports one inactive draft, backs up published versions, preserves production, and is repeatable", t => {
  const f = fixture(t);
  const first = f.run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /ACTIVO: false \| PUBLICADO: false \| NODOS: 43/);
  assert.equal((first.stdout + first.stderr).includes(CANARY), false);
  assert.deepEqual(f.state().workflows[0], f.current);
  assert.equal(f.state().workflows[1].active, false);
  const backup = path.join(f.root, fs.readdirSync(f.root).find(n => n.startsWith("importadora-n8n-backup-")));
  assert.equal(fs.statSync(backup).mode & 0o777, 0o700);
  const published = path.join(backup, "before-published.json");
  assert.equal(fs.statSync(published).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(published))[0].versionId, "publishedVersion");
  assert.equal(f.run().status, 0);
  assert.equal(f.state().imports, 1);
});

test("refuses a modified source containing an existing workflow ID before importing", t => {
  const f = fixture(t);
  const modified = path.join(f.root, "modified.json");
  fs.writeFileSync(modified, JSON.stringify({ ...source, id: "production" }));
  assert.equal(f.run(modified).status, 1);
  assert.equal(f.state().imports, 0);
  assert.deepEqual(f.state().workflows[0], f.current);
});

test("does not overwrite or deactivate an existing published workflow with the same name", t => {
  const existing = { ...source, id: "alreadyHere", active: true, activeVersionId: "live" };
  const f = fixture(t, "ok", [existing]);
  assert.equal(f.run().status, 1);
  assert.equal(f.state().imports, 0);
  assert.deepEqual(f.state().workflows[1], existing);
});

for (const mode of ["silent-failure", "changed-existing", "unexpected-active"]) {
  test(`detects ${mode}, retains the lock and prevents an automatic repeat`, t => {
    const f = fixture(t, mode);
    const result = f.run();
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /LISTO:/);
    assert.equal((result.stdout + result.stderr).includes(CANARY), false);
    assert.equal(fs.existsSync(path.join(f.root, ".importadora-router-v2-n8n.lock")), true);
    assert.equal(f.run().status, 1);
    assert.equal(f.state().imports, 1);
  });
}

test("rejects malformed exports without printing their contents or importing", t => {
  const f = fixture(t, "malformed");
  const result = f.run();
  assert.equal(result.status, 1);
  assert.equal((result.stdout + result.stderr).includes(CANARY), false);
  assert.equal(f.state().imports, 0);
});
