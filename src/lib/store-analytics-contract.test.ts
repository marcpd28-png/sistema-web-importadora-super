import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanSearchTerm, storeEventBatchSchema, trafficSource } from './store-analytics-contract';
const id = 'efcd0d0c-6b8f-4f55-9a62-e94d799d3da0';
const batch = { consent: true, sessionId: id, source: 'direct', device: 'mobile', events: [{ id, name: 'page_view', page: 'home' }] };
test('requires consent and rejects personal payload fields', () => {
  assert.equal(storeEventBatchSchema.safeParse(batch).success, true);
  for (const value of [{ ...batch, consent: false }, { ...batch, email: 'a@b.com' }, { ...batch, events: [{ ...batch.events[0], customerName: 'name' }] }]) assert.equal(storeEventBatchSchema.safeParse(value).success, false);
});
test('quote and search metadata stay on their intended events', () => {
  for (const event of [{ name: 'quote_created' }, { name: 'page_view', quoteId: 'fake' }, { name: 'search_results' }, { name: 'page_view', searchTerm: 'text' }, { name: 'view_item' }]) assert.equal(storeEventBatchSchema.safeParse({ ...batch, events: [{ id, page: 'home', ...event }] }).success, false);
});
test('search privacy filter removes contacts and normalizes product searches', () => {
  for (const text of ['ana@example.com', '+51 999 888 777', 'dirección: casa', 'contraseña abc', 'https://example.com', 'DNI 12345678']) assert.equal(cleanSearchTerm(text), '');
  assert.equal(cleanSearchTerm('  Taladro   20V '), 'taladro 20v');
});
test('source stores only coarse attribution', () => {
  assert.equal(trafficSource('https://google.com/search?q=private', '', 'https://tienda.test'), 'google');
  assert.equal(trafficSource('https://tienda.test/producto/abc', '', 'https://tienda.test'), 'direct');
  assert.equal(trafficSource('', 'tiktok', 'https://tienda.test'), 'tiktok');
});
