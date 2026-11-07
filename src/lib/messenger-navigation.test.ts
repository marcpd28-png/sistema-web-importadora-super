import assert from "node:assert/strict";
import test from "node:test";
import { beginMessengerHandoff, cancelMessengerHandoff, completeMessengerHandoff } from "./messenger-navigation";

test("opens a blank target during the click and navigates it only after a trusted response", () => {
  const events: string[] = [];
  const popup = {
    location: { assign: (href: string) => events.push(`navigate:${href}`) },
    focus: () => events.push("focus"),
    close: () => events.push("close"),
  } as unknown as Window;
  const opened = beginMessengerHandoff((url, target) => {
    events.push(`open:${url}:${target}`);
    return popup;
  });
  assert.equal(completeMessengerHandoff(opened, "https://m.me/importacionessuperoficial?ref=cotizacion-1"), true);
  assert.deepEqual(events, [
    "open:about:blank:importadora-messenger-order",
    "navigate:https://m.me/importacionessuperoficial?ref=cotizacion-1",
    "focus",
  ]);
});

test("closes the blank popup if quote submission fails", () => {
  let closed = false;
  cancelMessengerHandoff({ close: () => { closed = true; } } as unknown as Window);
  assert.equal(closed, true);
});
