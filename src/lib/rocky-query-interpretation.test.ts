import assert from "node:assert/strict";
import { test } from "node:test";
import { interpretProductQuery, validateInterpretedQuery } from "./rocky-query-interpretation";

test("interpretation cannot change numbers, dimensions or attach commercial facts", () => {
  assert.equal(validateInterpretedQuery('tablet de 32 pulgadas', { query: 'pantalla interactiva 32 pulgadas' }), 'pantalla interactiva 32 pulgadas');
  assert.equal(validateInterpretedQuery('tablet de 32 pulgadas', { query: 'tablet 32 GB' }), null);
  assert.equal(validateInterpretedQuery('iphone 15', { query: 'iphone 14' }), null);
  assert.equal(validateInterpretedQuery('iphone 15', { query: 'iphone' }), null);
  assert.equal(validateInterpretedQuery('iphone 15', { query: 'iphone 15', price: 100 }), null);
  assert.equal(validateInterpretedQuery('hola', { query: null }), null);
});

test("model failure, invalid JSON and invalid schema safely return no interpretation", async () => {
  const before = process.env.OLLAMA_ENABLED;
  process.env.OLLAMA_ENABLED = "true";
  try {
    for (const body of [{ message: { content: 'not JSON' } }, { message: { content: '{"query":123}' } }, {}]) {
      assert.equal(await interpretProductQuery('busco una licuadora', async () => Response.json(body)), null);
    }
    assert.equal(await interpretProductQuery('busco una licuadora', async () => { throw new Error('timeout'); }), null);
    assert.equal(await interpretProductQuery('busco una licuadora', async () => new Response('', { status: 503 })), null);
  } finally { if (before === undefined) delete process.env.OLLAMA_ENABLED; else process.env.OLLAMA_ENABLED = before; }
});

test("disabled model never makes a network request", async () => {
  const before = process.env.OLLAMA_ENABLED;
  process.env.OLLAMA_ENABLED = "false";
  try { assert.equal(await interpretProductQuery('licuadora', async () => { assert.fail('network called'); }), null); }
  finally { if (before === undefined) delete process.env.OLLAMA_ENABLED; else process.env.OLLAMA_ENABLED = before; }
});
