import { execFile } from "node:child_process";
import { catalogImageContentHash } from "./router-v2-catalog-image-match";

// Run bounded, local OCR without downloading customer URLs or sending media to a provider.
const OCR_SCRIPT = String.raw`
import io,json,subprocess,sys,warnings,re
from PIL import Image,ImageOps
warnings.simplefilter('error', Image.DecompressionBombWarning)
Image.MAX_IMAGE_PIXELS=12000000
data=sys.stdin.buffer.read(4194305)
if len(data)>4194304: raise ValueError('image limit')
with Image.open(io.BytesIO(data)) as source:
 if source.width*source.height>12000000: raise ValueError('pixel limit')
 image=ImageOps.exif_transpose(source).convert('RGB')
 image.thumbnail((1800,1800))
 if max(image.size)<1200:
  scale=min(3,1600/max(image.size)); image=image.resize((round(image.width*scale),round(image.height*scale)),Image.Resampling.LANCZOS)
 output=io.BytesIO(); image.save(output,format='PNG')
 scans=[]
 for mode in ['6','11']:
  result=subprocess.run(['/usr/bin/tesseract','stdin','stdout','-l','eng','--psm',mode,'tsv'],input=output.getvalue(),capture_output=True,timeout=4,check=True)
  if len(result.stdout)>400000: raise ValueError('text limit')
  scans.append(result.stdout.decode('utf-8'))
 crops=[]
 candidates=[]
 for scan in scans:
  for row in scan.splitlines()[1:]:
   f=row.split('\t')
   if len(f)==12 and f[0]=='5' and re.fullmatch(r'[A-Z]{1,4}\d{2,8}(?:[-_][A-Z0-9]{1,8})?',f[11]):
    if not any(c[0]==f[11] for c in candidates): candidates.append((f[11],*[int(v) for v in f[6:10]]))
 for code,x,y,w,h in candidates[:2]:
  crop=image.crop((max(0,x-6),max(0,y-6),min(image.width,x+w+6),min(image.height,y+h+6)))
  crop=ImageOps.grayscale(crop.resize((crop.width*2,round(crop.height*4/3)),Image.Resampling.LANCZOS))
  crop=ImageOps.expand(crop,border=30,fill=255)
  buf=io.BytesIO();crop.save(buf,format='PNG'); reads=[]
  for mode in ['6','7']:
   result=subprocess.run(['/usr/bin/tesseract','stdin','stdout','-l','eng','--psm',mode,'tsv'],input=buf.getvalue(),capture_output=True,timeout=2,check=True)
   reads.append(result.stdout.decode('utf-8'))
  crops.append({'candidate':code,'scans':reads})
 print(json.dumps({'scans':scans,'crops':crops}))
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
  const boxes = tsv.split(/\r?\n/).slice(1).flatMap(row => {
    const f = row.split("\t");
    if (f.length !== 12 || f[0] !== "5") return [];
    return [{ text: f[11], x: Number(f[6]), y: Number(f[7]), w: Number(f[8]), h: Number(f[9]), confidence: Number(f[10]) }];
  });
  // Supplier cards place the SKU below its label, often in a separate OCR block.
  for (const label of boxes.filter(b => /^(?:codigo|código|cod|sku)[:.]?$/i.test(b.text))) {
    if (!Number.isFinite(label.confidence) || label.confidence < 85) continue;
    for (const candidate of boxes) {
      if (!Number.isFinite(candidate.confidence) || candidate.confidence < 85) continue;
      const below = candidate.y >= label.y + label.h && candidate.y - (label.y + label.h) <= label.h * 6;
      const aligned = Math.abs(candidate.x + candidate.w / 2 - label.x - label.w / 2) <= Math.max(candidate.w, label.w);
      const code = candidate.text.replace(/^[([]|[)\],.;:]$/g, "").toUpperCase();
      if (below && aligned && /^[A-Z]{1,4}\d{2,8}(?:[-_][A-Z0-9]{1,8})?$/.test(code)) codes.add(code);
    }
  }
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

export function agreedCroppedCode(scans: string[]): string | null {
  if (scans.length !== 2) return null;
  const values = scans.map(scan => scan.split(/\r?\n/).slice(1).flatMap(row => {
    const fields = row.split("\t");
    if (fields.length !== 12 || fields[0] !== "5" || !fields[11].trim()) return [];
    return [{ code: fields[11], confidence: Number(fields[10]) }];
  }));
  if (values.some(words => words.length !== 1 || !Number.isFinite(words[0].confidence) || words[0].confidence < 70 || !/^[A-Z]{1,4}\d{2,8}(?:[-_][A-Z0-9]{1,8})?$/.test(words[0].code))) return null;
  return values[0][0].code === values[1][0].code ? values[0][0].code : null;
}

let busy = false;
export async function matchCatalogImageText(imageUrl: string, findVisibleCodes: (code: string) => Promise<{ code: string }[]>) {
  if (process.platform !== "linux" || process.env.BC_LOCAL_IMAGE_OCR_ENABLED === "false" || busy || !catalogImageContentHash(imageUrl)) return null;
  busy = true;
  try {
    const bytes = Buffer.from(imageUrl.slice(imageUrl.indexOf(",") + 1), "base64");
    const readings = await new Promise<{ scans: string[]; crops: { candidate: string; scans: string[] }[] }>((resolve, reject) => {
      const child = execFile("/usr/bin/python3", ["-c", OCR_SCRIPT], {
        timeout: 15000, maxBuffer: 1_000_000, windowsHide: true,
        encoding: "utf8", env: { NODE_ENV: process.env.NODE_ENV, PATH: "/usr/bin:/bin", LANG: "C.UTF-8", OMP_THREAD_LIMIT: "1" },
      }, (error, stdout) => {
        if (error) { reject(error); return; }
        try { resolve(JSON.parse(stdout)); } catch (parseError) { reject(parseError); }
      });
      child.stdin?.on("error", () => { /* Missing runtime exits through the exec callback. */ });
      child.stdin?.end(bytes);
    });
    const strict = agreedOcrCode(readings.scans);
    const cropped = [...new Set(readings.crops.flatMap(reading => {
      const code = agreedCroppedCode(reading.scans);
      return code && code === reading.candidate ? [code] : [];
    }))];
    const code = strict || (cropped.length === 1 ? cropped[0] : null);
    if (!code) return null;
    const matches = await findVisibleCodes(code);
    if (matches.length !== 1 || matches[0].code.toUpperCase() !== code) return null;
    return { status: "READY" as const, model: strict ? "local-tesseract-labeled-code" : "local-tesseract-cropped-code", hints: {
      code: matches[0].code, confidence: strict ? 0.85 : 0.7, visibleText: [strict ? `CODIGO: ${code}` : code],
    } };
  } catch {
    // Malformed images, unavailable binaries, timeouts and ambiguous text use the existing fallback.
    return null;
  } finally { busy = false; }
}
