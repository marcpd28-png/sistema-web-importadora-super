import { productQueryTerms, productTermAlternatives } from "./catalog-query";

export type ConversationProductLineStatus = "searching" | "catalog-delivered" | "selected";
export type ConversationProductTurnKind =
  | "new-search"
  | "line-follow-up"
  | "catalog-confirmation"
  | "product-selection"
  | "none";

export type ConversationProductLine = {
  id: string;
  query: string;
  terms: string[];
  quantity: number | null;
  status: ConversationProductLineStatus;
  selectedProductCode: string | null;
  selectedProductName: string | null;
};

export type ConversationProductState = {
  lines: ConversationProductLine[];
  activeLineId: string | null;
  turnKind: ConversationProductTurnKind;
};

type ConversationMessage = { role: "assistant" | "user"; text: string };
type ResolvedSelection = { lineId: string; code: string; name: string; brand?: string | null; category?: string | null };

const AFFIRMATION = /^(?:si|claro|dale|ok|okay|de acuerdo)(?:[!. ]|$)/i;
const CATALOG_DELIVERED = /(?:aqui|aquí).{0,48}catalogo completo|catalogo completo.{0,48}(?:pdf|aqui|aquí)/i;
const PURCHASE = /\b(?:quiero|deseo|llevo|llevare|llevaré|comprar|compra|me interesa|apartame|apártame)\b/i;
const ADDITIONAL_LINE = /\b(?:y\s+)?tambi[eé]n\b|\badem[aá]s\b/i;

function normalizeQuery(text: string) {
  return productQueryTerms(text).join(" ");
}

function hasProductIdentity(terms: string[]) {
  return terms.some((term) => /[a-z]/i.test(term));
}

function quantityFrom(text: string) {
  // Do not mistake a model/code such as "Clip 5" or "N368" for a quantity.
  const numeric = text.match(/\b(\d{1,4})\s*(?:unidades?|uds?|piezas?)\b/i);
  if (numeric) return Number(numeric[1]);
  const words: Record<string, number> = {
    un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
    seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  };
  const word = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/\b(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/);
  return word ? words[word[1]] ?? null : null;
}

function splitProductClauses(text: string) {
  return text.split(/\b(?:y\s+)?tambi[eé]n\b|\badem[aá]s\b/i).map((part) => part.trim()).filter(Boolean);
}

function currentLine(lines: ConversationProductLine[], activeLineId: string | null) {
  return activeLineId ? lines.find((line) => line.id === activeLineId) ?? null : null;
}

/**
 * Rebuilds purchase context from the durable conversation transcript. This is
 * deliberately event-sourced rather than a mutable single search string: a
 * customer can keep a JBL speaker line while adding a fan line later.
 */
export function deriveConversationProductState(
  history: ConversationMessage[] | undefined,
  currentMessage: string,
): ConversationProductState {
  const lines: ConversationProductLine[] = [];
  let activeLineId: string | null = null;
  let nextId = 1;
  let currentTurnKind: ConversationProductTurnKind = "none";
  const messages = [...(history ?? []), { role: "user" as const, text: currentMessage }];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const isCurrent = index === messages.length - 1;
    if (message.role === "assistant") {
      if (CATALOG_DELIVERED.test(message.text)) {
        const active = currentLine(lines, activeLineId);
        if (active) active.status = "catalog-delivered";
      }
      continue;
    }

    const text = message.text.trim();
    const clauses = splitProductClauses(text);
    const isAdditional = ADDITIONAL_LINE.test(text);
    const purchase = PURCHASE.test(text);
    const firstQuantity = quantityFrom(text);
    let addedLine = false;

    if (AFFIRMATION.test(text)) {
      const active = currentLine(lines, activeLineId);
      if (active) active.status = "catalog-delivered";
      if (isCurrent) currentTurnKind = "catalog-confirmation";
      continue;
    }

    for (const [clauseIndex, clause] of clauses.entries()) {
      const terms = productQueryTerms(clause);
      if (!hasProductIdentity(terms)) continue;
      const query = normalizeQuery(clause);
      const quantity = quantityFrom(clause) ?? (clauseIndex > 0 ? firstQuantity : null);
      // A purchase verb plus a model/code/quantity selects a concrete item.
      // A broad "quiero parlantes" remains a discovery search.
      const selected = purchase && (quantity !== null || terms.some((term) => /\d/.test(term)));
      const line: ConversationProductLine = {
        id: `line-${nextId++}`,
        query,
        terms,
        quantity,
        status: selected ? "selected" : "searching",
        selectedProductCode: null,
        selectedProductName: null,
      };
      lines.push(line);
      activeLineId = line.id;
      addedLine = true;
    }

    if (!addedLine) {
      const active = currentLine(lines, activeLineId);
      if (active && firstQuantity !== null) active.quantity = firstQuantity;
      if (isCurrent) currentTurnKind = "line-follow-up";
    } else if (isCurrent) {
      currentTurnKind = purchase && (isAdditional || lines.some((line) => line.status === "selected" && line.id === activeLineId))
        ? "product-selection"
        : "new-search";
    }
  }

  return { lines, activeLineId, turnKind: currentTurnKind };
}

function lineMatchesProduct(line: ConversationProductLine, product: ResolvedSelection) {
  const productTerms = new Set(productQueryTerms([product.name, product.brand, product.category].filter(Boolean).join(" ")));
  return line.terms.length > 0 && line.terms.every((term) =>
    productTermAlternatives(term).some((alternative) => productTerms.has(alternative)),
  );
}

/** Resolve a concrete model back onto the broad line it belongs to. For
 * example, "tres Clip 5" updates the existing "parlantes JBL" line rather
 * than replacing it, while a fan introduced with "también" remains separate.
 */
export function reconcileConversationProductSelections(
  state: ConversationProductState,
  selections: ResolvedSelection[],
): ConversationProductState {
  const lines = state.lines.map((line) => ({ ...line }));
  let activeLineId = state.activeLineId;

  for (const selection of selections) {
    const selectionLine = lines.find((line) => line.id === selection.lineId);
    if (!selectionLine || selectionLine.status !== "selected") continue;
    const parent = lines.find((line) =>
      line.id !== selectionLine.id &&
      lineMatchesProduct(line, selection) &&
      line.status !== "selected",
    );
    const target = parent ?? selectionLine;
    target.status = "selected";
    target.quantity = selectionLine.quantity ?? target.quantity;
    target.selectedProductCode = selection.code;
    target.selectedProductName = selection.name;
    if (parent) {
      const selectionIndex = lines.indexOf(selectionLine);
      lines.splice(selectionIndex, 1);
      if (activeLineId === selectionLine.id) activeLineId = parent.id;
    }
  }

  return { ...state, lines, activeLineId };
}
