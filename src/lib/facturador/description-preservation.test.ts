import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { Prisma } from "@prisma/client";
import ts from "typescript";

// Execute the real write functions in isolation, without connecting to the ERP
// or a production database. Extracting their AST keeps private helpers private.
function source(path: string) {
  return ts.createSourceFile(path, readFileSync(resolve(path), "utf8"), ts.ScriptTarget.Latest, true);
}

function evaluate(code: string, context: Record<string, unknown>) {
  return runInNewContext(ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, { Prisma, randomUUID, ...context });
}

const product = {
  code: "TEST-EDITORIAL", slug: "test-editorial", name: "Producto ERP",
  unitPrice: 25, wholesalePrice: null, boxPrice: null, stockUnits: 8,
  description: "Texto del ERP", existingProductId: "existing-id",
  writeAction: "updated", syncEnabled: true,
};
const protectedFields = ["description", "technicalSpecs", "specifications", "digitalProfile"];

function assertEditorialUntouched(data: Record<string, unknown>) {
  for (const field of protectedFields) assert.equal(data[field], undefined, `${field} must not be updated`);
  assert.equal(data.stockUnits, 8);
}

function loadSync(prisma: Record<string, unknown>) {
  const file = source("src/lib/facturador/sync.ts");
  const names = ["buildPrismaProductCreateData", "buildPrismaProductUpdateData", "buildProductRow",
    "upsertProductsByCode", "updateProductsByExistingId", "normalizeErrorMessage"];
  const code = file.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ""))
    .map((node) => node.getText(file)).join("\n");
  return evaluate(`${code}\n;({ ${names.join(",")} });`, { prisma });
}

for (const description of [null, "", "Otra descripción del ERP"]) {
  for (const mode of ["FULL", "INCREMENTAL", "NEW_ONLY", "STOCK_PRICE", "STOCK_ONLY"]) {
    test(`${mode}: preserve editorial content when ERP description is ${JSON.stringify(description)}`, async () => {
      const writes: Record<string, unknown>[] = [];
      const api = loadSync({ product: { update: async ({ data }: { data: Record<string, unknown> }) => writes.push(data) } });
      const input = { ...product, description };
      assertEditorialUntouched(api.buildPrismaProductUpdateData(input, mode));
      assert.equal(api.buildPrismaProductCreateData(input).description, description);
      await api.updateProductsByExistingId([input], mode);
      assert.equal(writes.length, 1);
      assertEditorialUntouched(writes[0]);
    });
  }
}

test("bulk SQL preserves editorial columns in every synchronization mode", async () => {
  const statements: Prisma.Sql[] = [];
  const api = loadSync({ $executeRaw: async (sql: Prisma.Sql) => statements.push(sql) });
  for (const mode of ["FULL", "INCREMENTAL", "NEW_ONLY", "STOCK_PRICE", "STOCK_ONLY"]) {
    await api.upsertProductsByCode([product], mode);
  }
  assert.equal(statements.length, 5);
  for (const statement of statements) {
    const [insert, update] = statement.text.split('ON CONFLICT ("code") DO UPDATE');
    assert.ok(insert.includes('"description"'), "new products still receive the ERP description");
    assert.ok(update);
    for (const field of protectedFields) assert.ok(!update.includes(`"${field}"`), `${field} must not be overwritten`);
    assert.ok(update.includes('"stockUnits" ='));
  }
});

test("Prisma fallback preserves editorial content if bulk SQL fails", async () => {
  const writes: Array<{ create: Record<string, unknown>; update: Record<string, unknown> }> = [];
  const api = loadSync({
    $executeRaw: async () => { throw new Error("Simulated bulk failure"); },
    product: { upsert: async (args: typeof writes[number]) => writes.push(args) },
  });
  const result = await api.upsertProductsByCode([product], "FULL");
  assert.equal(result.updated, 1);
  assert.equal(writes.length, 1);
  assertEditorialUntouched(writes[0].update);
  assert.equal(writes[0].create.description, product.description);
});

for (const path of ["src/lib/facturador/sync-processor.ts", "prisma/sync-facturador-product.ts"]) {
  test(`${path}: individual upsert only imports descriptions on creation`, () => {
    const file = source(path);
    const calls: ts.CallExpression[] = [];
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && node.expression.getText(file) === "prisma.product.upsert") calls.push(node);
      ts.forEachChild(node, visit);
    }
    visit(file);
    assert.equal(calls.length, 1);
    for (const description of [null, "", "Otro texto ERP"]) {
      const args = evaluate(`(${calls[0].arguments[0].getText(file)});`, {
        mapped: { product: { ...product, description } }, event: { sku: product.code },
        syncEnabled: true, eventUpdatedAt: new Date(), now: new Date(),
        imageUrl: null, mirror: { localUrl: null },
      });
      assertEditorialUntouched(args.update);
      assert.equal(args.create.description, description);
    }
  });
}
