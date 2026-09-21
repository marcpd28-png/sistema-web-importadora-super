import { execFile } from "node:child_process";
import path from "node:path";
import { catalogImageContentHash } from "../router-v2-catalog-image-match";
import { matchCatalogImageName, type ImageNameText } from "./image-names";

// Formatting only: never substitute O/0, I/1, or change model digits.
export const imageCodeKey = (code: string) => code.toUpperCase().trim().replace(/[()]/g, "").replace(/\s+/g, "").replace(/[.,;:]+$/, "");
export type CatalogImageReference = { code: string; name?: string };
export function catalogImageAliases(product: CatalogImageReference): string[] {
  const aliases = [imageCodeKey(product.code)];
  const name = product.name || "";
  const leading = name.match(/^\s*\(([A-Z0-9][A-Z0-9 ._-]{0,30})\)/i)?.[1];
  const labeled = [...name.matchAll(/\bCOD(?:IGO)?\.?\s*[:.]?\s*\(?([A-Z0-9]+(?:[-_][A-Z0-9]+)*)\b/gi)].map(match => match[1]);
  for (const value of [leading, ...labeled]) {
    if (value && /[a-z]/i.test(value) && /\d/.test(value)) aliases.push(imageCodeKey(value));
  }
  return [...new Set(aliases)];
}
export function resolveImageCode(observed: string, references: readonly (string | CatalogImageReference)[]) {
  const key = imageCodeKey(observed);
  if (!key) return { kind: "NONE", codes: [] as string[] };
  const products = references.map(reference => typeof reference === "string" ? { code: reference } : reference);
  const exact = products.filter(product => catalogImageAliases(product).includes(key)).map(product => product.code);
  const variants = products.filter(product => catalogImageAliases(product).some(alias => alias.startsWith(`${key}-`) || alias.startsWith(`${key}_`))).map(product => product.code);
  const codes = [...new Set([...exact, ...variants])];
  return { kind: codes.length === 1 && exact.length === 1 && !variants.length ? "EXACT" : codes.length ? "VARIANTS" : "NONE", codes };
}
export type ImageCodeRead = { code: string; confidence: number; view: string; labeled: boolean };
export function confirmedImageCodes(reads: ImageCodeRead[]) {
  const groups = new Map<string, ImageCodeRead[]>();
  for (const read of reads) {
    if (!Number.isFinite(read.confidence) || read.confidence < 70) continue;
    const key = imageCodeKey(read.code);if (!key) continue;
    groups.set(key, [...groups.get(key) || [], read]);
  }
  return [...groups].filter(([, group]) => new Set(group.map(read => read.view)).size >= 2)
    .map(([code, group]) => ({ code, confidence: Math.min(...group.map(read => read.confidence)) / 100 }));
}
export type ImageCodeMatch = { status: "READY" | "MULTIPLE" | "CHOICES"; model: string; hints: { code: string; confidence: number }; codes: string[] };
let busy = false;
export async function identifyCatalogImageCodes(imageUrl: string, visibleCodes: readonly (string | CatalogImageReference)[]): Promise<ImageCodeMatch | null> {
  if (process.platform !== "linux" || busy || !catalogImageContentHash(imageUrl)) return null;
  busy = true;
  try {
    const keys = [...new Set(visibleCodes.flatMap(code => {
      return catalogImageAliases(typeof code === "string" ? { code } : code).flatMap(key => [key, key.split(/[-_]/)[0]]);
    }))];
    const output = await new Promise<{ reads: ImageCodeRead[]; text: ImageNameText[] }>((resolve,reject) => {
      const child=execFile("/usr/bin/python3",[path.join(process.cwd(),"scripts/rocky/image-code-ocr.py")],{timeout:22000,maxBuffer:1_000_000,encoding:"utf8",windowsHide:true,
        env:{PATH:"/usr/bin:/bin",LANG:"C.UTF-8",OMP_THREAD_LIMIT:"1",NODE_ENV:process.env.NODE_ENV}},(error,stdout)=>{
          if(error){reject(error);return;}try{resolve(JSON.parse(stdout));}catch(error){reject(error);}
        });
      child.stdin?.on("error",()=>{});
      child.stdin?.end(JSON.stringify({image:imageUrl.slice(imageUrl.indexOf(",")+1),keys,includeText:true}));
    });
    const confirmed=confirmedImageCodes(output.reads);
    const resolved=confirmed.map(read=>({...read,...resolveImageCode(read.code,visibleCodes)})).filter(read=>read.codes.length);
    const codes=[...new Set(resolved.flatMap(read=>read.codes))];
    if (!codes.length) {
      const names = matchCatalogImageName(output.text, visibleCodes.map(product => typeof product === "string" ? { code: product } : product));
      return names.length ? { status: names.length === 1 ? "READY" : "CHOICES", model: "local-catalog-name-multipass", hints: { code: names.join(", "), confidence: .8 }, codes: names } : null;
    }
    const exact=resolved.every(read=>read.kind==="EXACT") && codes.length===1;
    return {status:exact?"READY":resolved.every(read=>read.kind==="EXACT")?"MULTIPLE":"CHOICES",model:"local-catalog-code-multipass",hints:{code:resolved.map(read=>read.code).join(", "),confidence:Math.min(...resolved.map(read=>read.confidence))},codes};
  } catch { return null; } finally {busy=false;}
}
