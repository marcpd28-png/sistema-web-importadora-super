import { catalogImageAliases, imageCodeKey } from "./rocky/image-codes";
import { imageNameWords } from "./rocky/image-names";

export type AuditStatus = "CODE_MATCH" | "CODE_DIFFERENT" | "NAME_MATCH" | "UNVERIFIABLE" | "NO_IMAGE" | "ERROR";
export type NameStatus = "MATCH" | "PARTIAL" | "INSUFFICIENT";
export type AuditRead = { code: string; confidence: number; view: string; label: string; box: number[] };
export type AuditText = { text: string; confidence: number; view: string };
export type PhotoScan = { id: string; productId: string; code: string; name: string; imageUrl: string; resolvedImageUrl?: string; roles: string[]; sha256?: string; scannedAt: string; status: string; error?: string; reads: AuditRead[]; text: AuditText[]; elapsedMs?: number };
export type AuditRow = Omit<PhotoScan, "reads" | "text" | "status"> & {
  status: AuditStatus; printedCodes: string[]; codeEvidence: AuditRead[];
  nameStatus: NameStatus; nameEvidence: string; matchingWords: string[]; nameCoverage: number;
  aliasMatch: boolean; reason: string; visible: boolean; stock: number;
  autoStatus?: AuditStatus;
  visualReview?: { sha256: string; status: AuditStatus; printedCodes: string[]; note: string; reviewedAt: string; reviewer: "ASSISTANT_VISUAL" };
};
export type AuditReport = { version: number; generatedAt: string; complete: boolean; totalProducts: number; totalPhotos: number; scannedPhotos: number; noPhotoProducts: number; counts: Record<AuditStatus, number>; rows: AuditRow[] };

export function nameTokens(text: string) {
  return imageNameWords(text);
}

// A matching generic noun alone never establishes the exact product identity.
export function compareImageName(name: string, text: AuditText[]) {
  const expected = nameTokens(name);
  const reliable = text.filter(line => line.confidence >= 65);
  const observed = new Set(reliable.flatMap(line => nameTokens(line.text)));
  const matchingWords = expected.filter(word => observed.has(word));
  const coverage = expected.length ? matchingWords.length / expected.length : 0;
  const views = new Set(reliable.filter(line => matchingWords.filter(word => nameTokens(line.text).includes(word)).length >= 2).map(line => line.view));
  const matched = matchingWords.length >= 3 && coverage >= .65 && views.size >= 2;
  const evidence = [...new Set(reliable.filter(line => nameTokens(line.text).some(word => matchingWords.includes(word))).map(line => line.text))].slice(0, 8).join(" · ").slice(0, 1000);
  return { nameStatus: (matched ? "MATCH" : matchingWords.length >= 2 ? "PARTIAL" : "INSUFFICIENT") as NameStatus, matchingWords, nameCoverage: Math.round(coverage * 100), nameEvidence: evidence || reliable.slice(0, 6).map(line => line.text).join(" · ").slice(0, 1000) };
}

export function classifyPhoto(scan: PhotoScan, product: { code: string; name: string; isVisible: boolean; stockUnits: number }): AuditRow {
  const groups = new Map<string, AuditRead[]>();
  for (const read of scan.reads) {
    if (!Number.isFinite(read.confidence) || read.confidence < 85 || !read.label) continue;
    const key = imageCodeKey(read.code);
    if (!key) continue;
    groups.set(key, [...groups.get(key) || [], read]);
  }
  const confirmed = [...groups].filter(([, reads]) => new Set(reads.map(read => read.view)).size >= 2);
  const printedCodes = confirmed.map(([code]) => code);
  const codeEvidence = confirmed.flatMap(([, reads]) => reads);
  const name = compareImageName(product.name, scan.text);
  const internal = imageCodeKey(product.code);
  const exact = printedCodes.includes(internal);
  const aliases = catalogImageAliases(product);
  const aliasMatch = printedCodes.some(code => aliases.includes(code) || aliases.some(alias => alias.startsWith(code + "-")));
  let status: AuditStatus = "UNVERIFIABLE";
  let reason = "No hay dos lecturas suficientemente claras del código. La falta de lectura no demuestra una incongruencia.";
  if (scan.status === "ERROR") { status = "ERROR"; reason = scan.error || "No se pudo procesar la imagen."; }
  else if (printedCodes.length === 1 && exact) { status = "CODE_MATCH"; reason = "El código de la etiqueta coincide con el código interno (normalizando formato)."; }
  else if (printedCodes.length === 1 && !exact) {
    status = "CODE_DIFFERENT";
    reason = aliasMatch ? "El código impreso difiere del interno, pero figura como referencia del producto. Esto no implica que la foto sea incorrecta."
      : name.nameStatus === "MATCH" ? "El código impreso difiere del interno; el texto del nombre presenta coincidencia. Validar la referencia antes de corregir la foto."
      : "El código impreso difiere del interno y no aparece entre sus referencias explícitas. Comparar foto y nombre antes de corregir.";
  } else if (printedCodes.length > 1) reason = "Se leen varias referencias en la imagen; no se ha elegido una como código principal.";
  else if (name.nameStatus === "MATCH") { status = "NAME_MATCH"; reason = "Hay coincidencia textual del nombre. No se pudo confirmar un código único; no acredita por sí sola modelo o variante exactos."; }
  const { reads: _reads, text: _text, status: _status, ...base } = scan;
  void _reads; void _text; void _status;
  return { ...base, code: product.code, name: product.name, status, printedCodes, codeEvidence, ...name, aliasMatch, reason, visible: product.isVisible, stock: product.stockUnits };
}

export const auditStatusLabels: Record<AuditStatus, string> = { CODE_MATCH: "Código congruente", CODE_DIFFERENT: "Códigos incongruentes", NAME_MATCH: "Nombre coincidente · código sin confirmar", UNVERIFIABLE: "Por verificar", NO_IMAGE: "Sin foto", ERROR: "Error de lectura" };

export function auditCsv(report: AuditReport) {
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows: unknown[][] = [["Producto ID", "Código inventario", "Nombre tienda", "Visible", "Stock", "Foto", "Uso", "Estado", "Código leído", "Nombre", "Palabras coincidentes", "Texto leído", "Referencia en nombre", "Motivo", "SHA256", "Fecha", "Revisión visual del asistente"]];
  for (const row of report.rows) rows.push([row.productId, row.code, row.name, row.visible, row.stock, row.imageUrl, row.roles.join(" | "), auditStatusLabels[row.status], row.printedCodes.join(" | "), row.nameStatus, row.matchingWords.join(" | "), row.nameEvidence, row.aliasMatch, row.reason, row.sha256, row.scannedAt, row.visualReview?.note]);
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n");
}
