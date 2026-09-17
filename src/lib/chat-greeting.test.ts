import assert from "node:assert/strict";
import test from "node:test";
import { getChatGreeting, greetChatResponse, type ChatReplyMessage } from "./chat-greeting";

const at = (time: string) => new Date(`2026-09-17T${time}-05:00`);

test("saluda por la hora de Lima en cada límite, incluso al cruzar medianoche UTC", () => {
  for (const [time, expected] of [
    ["00:00:00", "Buenas noches"], ["04:59:59", "Buenas noches"],
    ["05:00:00", "Buenos días"], ["11:59:59", "Buenos días"],
    ["12:00:00", "Buenas tardes"], ["18:59:59", "Buenas tardes"],
    ["19:00:00", "Buenas noches"], ["23:59:59", "Buenas noches"],
  ]) assert.equal(getChatGreeting(at(time)), expected, time);
  assert.equal(getChatGreeting(new Date("2026-09-18T01:00:00Z")), "Buenas noches");
});

test("saluda antes de atender catálogo o celulares Xiaomi, aunque el cliente no haya saludado", () => {
  for (const content of [
    "Te comparto nuestro catálogo completo: https://example.com/",
    "Estos son los celulares Xiaomi disponibles: Redmi Note 14, S/ 699.",
    "No encontré celulares Xiaomi publicados. Puedes indicarme otro modelo.",
  ]) {
    assert.equal(greetChatResponse([{ type: "TEXT", content }], at("20:00:00"))[0].content,
      `¡Buenas noches! 😊 ${content}`);
  }
});

test("reemplaza saludos fijos y repetidos sin alterar la respuesta ni duplicarlos al preparar de nuevo", () => {
  for (const prefix of ["Hola, ", "¡Hola! ", "👋 ¡Hola! 😊 ", "Buenos días. ", "¡Buenas tardes! ", "¡Hola! Buenos días, ", "**Buenas noches**: "]) {
    const content = `${prefix}Te comparto el catálogo de Xiaomi.`;
    const messages = greetChatResponse([{ type: "TEXT", content }], at("13:00:00"));
    assert.equal(messages[0].content, "¡Buenas tardes! 😊 Te comparto el catálogo de Xiaomi.");
    assert.deepEqual(greetChatResponse(messages, at("13:00:00")), messages);
  }
});

test("saluda una sola vez por lote y conserva orden, archivos, precios y enlaces", () => {
  for (const type of ["IMAGE", "DOCUMENT", "VIDEO"] as const) {
    const messages: ChatReplyMessage[] = [
      { type, content: "Xiaomi Redmi Note 14 — S/ 699", mediaUrl: "https://example.com/product" },
      { type: "IMAGE", content: "Xiaomi Redmi 14C — S/ 499", mediaUrl: "https://example.com/14c.jpg" },
      { type: "TEXT", content: "¿Qué modelo te interesa?" },
    ];
    const result = greetChatResponse(messages, at("08:00:00"));
    assert.equal(result.length, 3);
    assert.equal(result[0].content, "¡Buenos días! 😊 Xiaomi Redmi Note 14 — S/ 699");
    assert.equal(result[0].type, type);
    assert.equal(result[0].mediaUrl, messages[0].mediaUrl);
    assert.deepEqual(result.slice(1), messages.slice(1));
    assert.equal(messages[0].content, "Xiaomi Redmi Note 14 — S/ 699");
  }
});

test("no pierde contenido al alcanzar 4000 caracteres ni cambia el tamaño del lote según la hora", () => {
  for (const length of [3983, 3984, 4000]) {
    const message: ChatReplyMessage = { type: "TEXT", content: "a".repeat(length) };
    const morning = greetChatResponse([message], at("09:00:00"));
    const night = greetChatResponse([message], at("21:00:00"));
    assert.equal(morning.length, night.length);
    assert(morning.every(m => m.content.length <= 4000));
    assert(night.every(m => m.content.length <= 4000));
    if (morning.length === 2) assert.equal(morning[1].content, message.content);
    else assert(morning[0].content.endsWith(message.content));
  }
  assert.deepEqual(greetChatResponse([], at("09:00:00")), []);
});
