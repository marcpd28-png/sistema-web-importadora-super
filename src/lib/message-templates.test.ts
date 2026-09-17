import assert from "node:assert/strict";
import { test } from "node:test";
import { contactTemplateValues, extractTemplateVariables, messageTemplateSchema, renderMessageTemplate, templateValuesSchema } from "./message-templates";

test("detecta variables únicas y mantiene saltos de línea y valores literales", () => {
  const content = "Hola {{ nombre }}\nPedido {{pedido}} para {{nombre}}";
  assert.deepEqual(extractTemplateVariables(content), ["nombre", "pedido"]);
  assert.deepEqual(renderMessageTemplate(content, { nombre: "María", pedido: "$& <123>" }), {
    content: "Hola María\nPedido $& <123> para María", missing: [], tooLong: false,
  });
});

test("rechaza expresiones, variables mal escritas y nombres reservados", () => {
  for (const content of ["{{nombre", "{{Nombre}}", "{{cliente.nombre}}", "{{constructor}}", "{{$json.nombre}}", "{{nombre()}}", "{{}}", "{{{nombre}}}"]) {
    assert.equal(messageTemplateSchema.safeParse({ name: "Prueba", content }).success, false, content);
  }
  assert.equal(templateValuesSchema.safeParse(JSON.parse('{"__proto__":"x"}')).success, false);
});

test("no rellena datos desconocidos ni evalúa variables dentro de los valores", () => {
  assert.deepEqual(contactTemplateValues({ name: null, phone: null }), { nombre: "", telefono: "" });
  assert.deepEqual(renderMessageTemplate("Hola {{nombre}}, pedido {{pedido}}", { nombre: "  " }).missing, ["nombre", "pedido"]);
  assert.equal(renderMessageTemplate("Hola {{nombre}}", { nombre: "{{pedido}}", pedido: "secreto" }).content, "Hola {{pedido}}");
});

test("valida tamaños antes y después de reemplazar variables", () => {
  assert.equal(messageTemplateSchema.safeParse({ name: "  ", content: "Hola" }).success, false);
  assert.equal(messageTemplateSchema.safeParse({ name: "Prueba", content: "x".repeat(4001) }).success, false);
  assert.equal(renderMessageTemplate("{{texto}} {{texto}}", { texto: "x".repeat(2000) }).tooLong, true);
  const manyVariables = Array.from({ length: 21 }, (_, i) => `{{campo${i}}}`).join(" ");
  assert.equal(messageTemplateSchema.safeParse({ name: "Prueba", content: manyVariables }).success, false);
});
