export const CHAT_TIME_ZONE = "America/Lima";

const localHour = new Intl.DateTimeFormat("en-GB", {
  timeZone: CHAT_TIME_ZONE,
  hour: "2-digit",
  hourCycle: "h23",
});

export function getChatGreeting(now = new Date()) {
  const hour = Number(localHour.format(now));
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

// Only remove greetings at the start; product names and the rest of the answer stay intact.
const leadingGreeting = /^(?:[\s¡!¿?,.:;*🙌👋😊🙂☀️🌞🌙]*)(?:hola|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|buen\s+d[ií]a|buenas)(?=$|[\s!?,.:;*👋😊🙂☀️🌞🌙])[\s!?,.:;*👋😊🙂☀️🌞🌙]*/iu;

export type ChatReplyMessage = {
  type: "TEXT" | "IMAGE" | "DOCUMENT" | "VIDEO";
  content: string;
  mediaUrl?: string | null;
};

/** Greet once per response, including responses starting with an image or PDF. */
export function greetChatResponse(messages: ChatReplyMessage[], now = new Date()): ChatReplyMessage[] {
  if (!messages.length) return [];
  const [first, ...rest] = messages;
  let body = first.content.trim();
  while (leadingGreeting.test(body)) body = body.replace(leadingGreeting, "");
  const greeting = `¡${getChatGreeting(now)}! 😊`;
  const content = body ? `${greeting} ${body}` : greeting;

  // Keep long replies intact. Reserve the longest greeting so retries have the same batch size
  // even when the time period changes between attempts.
  if (body.length + "¡Buenas noches! 😊 ".length > 4000) {
    return [{ type: "TEXT", content: greeting, mediaUrl: null }, { ...first, content: body }, ...rest];
  }
  return [{ ...first, content }, ...rest];
}
