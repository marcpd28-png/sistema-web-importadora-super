import { execFile } from "node:child_process";
import { catalogImageContentHash } from "./router-v2-catalog-image-match";

// Run bounded, local OCR without downloading customer URLs or sending media to a provider.
const OCR_SCRIPT = String.raw`
import io,json,subprocess,sys,warnings
from PIL import Image,ImageOps
warnings.simplefilter('error', Image.DecompressionBombWarning)
Image.MAX_IMAGE_PIXELS=12000000
data=sys.stdin.buffer.read(4194305)
if len(data)>4194304: raise ValueError('image limit')
with Image.open(io.BytesIO(data)) as source:
 if source.width*source.height>12000000: raise ValueError('pixel limit')
 image=ImageOps.exif_transpose(source).convert('RGB')
 image.thumbnail((1800,1800))
 output=io.BytesIO(); image.save(output,format='PNG')
 scans=[]
 for mode in ['6','11']:
  result=subprocess.run(['/usr/bin/tesseract','stdin','stdout','-l','eng','--psm',mode,'tsv'],input=output.getvalue(),capture_output=True,timeout=4,check=True)
  if len(result.stdout)>400000: raise ValueError('text limit')
  scans.append(result.stdout.decode('utf-8'))
 print(json.dumps(scans))
`;

/** Only an explicitly labeled SKU/code qualifies. Never repair O/0 or other digits. */
export function codesFromOcrTsv(tsv: string): string[] {
  const lines = new Map<string, { text: string; confidence: number }[]>();
  for (const row of tsv.split(/\r?\n/).slice(1)) {
    const fields = row.split("\t");
    if (fields.length !== 12 || fields[0] !== "5") continue;
    const key = fields.slice(1, 5).join(":");
    const words = lines.get(key) ?? [];
    words.push({ text: fields[11], confidence: Number(fields[10]) }); lines.set(key, words);
  }
  const codes = new Set<string>();
  for (const words of lines.values()) {
    for (let i = 0; i < words.length - 1; i++) {
      if (!/^(?:codigo|código|cod|sku)[:.]?$/i.test(words[i].text)) continue;
      if (!Number.isFinite(words[i].confidence) || words[i].confidence < 85) return [];
      const candidate = words[i + 1];
      if (!Number.isFinite(candidate.confidence) || candidate.confidence < 85) return [];
      const code = candidate.text.replace(/^[([]|[)\],.;:]$/g, "").toUpperCase();
      if (/^[A-Z]{1,4}\d{2,8}(?:[-_][A-Z0-9]{1,8})?$/.test(code)) codes.add(code);
    }
  }
  return [...codes];
}

export function agreedOcrCode(scans: string[]): string | null {
  if (scans.length !== 2) return null;
  const candidates = scans.map(codesFromOcrTsv);
  return candidates.every(codes => codes.length === 1 && codes[0] === candidates[0][0]) ? candidates[0][0] : null;
}

let busy = false;
export async function matchCatalogImageText(imageUrl: string, findVisibleCodes: (code: string) => Promise<{ code: string }[]>) {
  if (process.platform !== "linux" || process.env.BC_LOCAL_IMAGE_OCR_ENABLED === "false" || busy || !catalogImageContentHash(imageUrl)) return null;
  busy = true;
  try {
    const bytes = Buffer.from(imageUrl.slice(imageUrl.indexOf(",") + 1), "base64");
    const scans = await new Promise<string[]>((resolve, reject) => {
      const child = execFile("/usr/bin/python3", ["-c", OCR_SCRIPT], {
        timeout: 12000, maxBuffer: 1_000_000, windowsHide: true,
        encoding: "utf8", env: { NODE_ENV: process.env.NODE_ENV, PATH: "/usr/bin:/bin", LANG: "C.UTF-8", OMP_THREAD_LIMIT: "1" },
      }, (error, stdout) => {
        if (error) { reject(error); return; }
        try { resolve(JSON.parse(stdout)); } catch (parseError) { reject(parseError); }
      });
      child.stdin?.on("error", () => { /* Missing runtime exits through the exec callback. */ });
      child.stdin?.end(bytes);
    });
    const code = agreedOcrCode(scans);
    if (!code) return null;
    const matches = await findVisibleCodes(code);
    if (matches.length !== 1 || matches[0].code.toUpperCase() !== code) return null;
    return { status: "READY" as const, model: "local-tesseract-labeled-code", hints: {
      code: matches[0].code, confidence: 0.85, visibleText: [`CODIGO: ${code}`],
    } };
  } catch {
    // Malformed images, unavailable binaries, timeouts and ambiguous text use the existing fallback.
    return null;
  } finally { busy = false; }
}
