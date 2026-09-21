"""Exhaustive, resumable per-photo OCR. Never infer text from ERP codes or filenames."""
import concurrent.futures, hashlib, io, json, os, re, subprocess, time, urllib.request
from urllib.parse import urlsplit, urlunsplit, quote, unquote
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(os.environ.get("CATALOG_AUDIT_DIR", "/home/IMPORTADORA-audits/catalog-images"))
PUBLIC = Path("/home/IMPORTADORA/public")
VERSION = "photo-by-photo-v1"
IMAGE_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; ImportadoraImageMirror/2.0)", "Cache-Control": "no-cache, no-store, max-age=0", "Pragma": "no-cache"}
Image.MAX_IMAGE_PIXELS = 30_000_000
os.environ["OMP_THREAD_LIMIT"] = "1"

def norm(text):
    return re.sub(r"\s+", "", text.upper().strip("().,:; "))

def scan(image, mode, view):
    buffer = io.BytesIO(); image.save(buffer, format="PNG")
    result = subprocess.run(["tesseract", "stdin", "stdout", "-l", "eng", "--psm", str(mode), "tsv"], input=buffer.getvalue(), capture_output=True, timeout=12, check=True)
    words = []; lines = {}
    for row in result.stdout.decode().splitlines()[1:]:
        f = row.split("\t")
        if len(f) != 12 or f[0] != "5" or not f[11].strip(): continue
        w = dict(text=f[11], confidence=float(f[10]), x=int(f[6]), y=int(f[7]), width=int(f[8]), height=int(f[9]))
        words.append(w); lines.setdefault(tuple(f[1:5]), []).append(w)
    reads = []
    labels = [w for w in words if re.fullmatch(r"(?:C[OÓ0]DIG[O0]|C[O0]D|SKU)[:.]?", w["text"], re.I)]
    for word in words:
        code = norm(word["text"])
        if not re.fullmatch(r"[A-Z0-9]+(?:[-_][A-Z0-9]+)*", code) or not 2 <= len(code) <= 35 or not any(c.isdigit() for c in code): continue
        if word["confidence"] < 45: continue
        for label in labels:
            lh = max(label["height"], word["height"])
            below = 0 <= word["y"]-label["y"] <= lh*4 and abs(word["x"]+word["width"]/2-label["x"]-label["width"]/2) <= max(word["width"],label["width"])*.85
            beside = abs(word["y"]-label["y"]) <= lh*.8 and 0 <= word["x"]-label["x"]-label["width"] <= lh*2
            if below or beside:
                reads.append(dict(code=code, confidence=word["confidence"], view=view, label=label["text"], box=[word["x"],word["y"],word["width"],word["height"]]));break
    text = [dict(text=" ".join(w["text"] for w in line), confidence=round(sum(w["confidence"] for w in line)/len(line),2), view=view) for line in lines.values()]
    return reads, text

def work(item):
    started = time.monotonic()
    result = {**item, "version": VERSION, "scannedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())}
    try:
        url = item["imageUrl"]
        if url.startswith("/"):
            file = (PUBLIC / url.lstrip("/")).resolve()
            if not file.is_relative_to(PUBLIC.resolve()): raise ValueError("OUTSIDE_PUBLIC")
            try: data = file.read_bytes()
            except FileNotFoundError:
                source=item.get("sourceImageUrl") or ""
                if not source.startswith("https://original.negocioserp.com/storage/uploads/items/"): raise
                parts=urlsplit(source);source=urlunsplit((parts.scheme,parts.netloc,quote(unquote(parts.path),safe="/"),parts.query,""))
                with urllib.request.urlopen(urllib.request.Request(source,headers=IMAGE_HEADERS),timeout=20) as response:
                    if not response.url.startswith("https://original.negocioserp.com/"):raise ValueError("UNEXPECTED_REDIRECT")
                    data=response.read(12_000_001)
                result["resolvedImageUrl"]=source
        elif url.startswith("https://original.negocioserp.com/storage/uploads/items/"):
            parts=urlsplit(url);url=urlunsplit((parts.scheme,parts.netloc,quote(unquote(parts.path),safe="/"),parts.query,""))
            request = urllib.request.Request(url, headers=IMAGE_HEADERS)
            with urllib.request.urlopen(request,timeout=20) as response:
                if not response.url.startswith("https://original.negocioserp.com/"): raise ValueError("UNEXPECTED_REDIRECT")
                data=response.read(12_000_001)
        else: raise ValueError("UNSUPPORTED_IMAGE_SOURCE")
        if len(data)>12_000_000: raise ValueError("IMAGE_TOO_LARGE")
        result["sha256"] = hashlib.sha256(data).hexdigest()
        if not item["imageUrl"].startswith("/") or result.get("resolvedImageUrl"):
            (ROOT/"retrieved").mkdir(exist_ok=True);(ROOT/"retrieved"/(item["id"]+".image")).write_bytes(data)
        with Image.open(io.BytesIO(data)) as original:
            image=ImageOps.exif_transpose(original).convert("RGB")
            result["dimensions"] = list(image.size)
            image.thumbnail((1500,1500))
            if max(image.size)<1000:
                scale=min(2,1200/max(image.size));image=image.resize((round(image.width*scale),round(image.height*scale)),Image.Resampling.LANCZOS)
            reads=[]; texts=[]
            for mode in [11,6]:
                r,t=scan(image,mode,"full-"+str(mode)); reads.extend(r);texts.extend(t)
            # A third independent layout isolates labels and avoids matching prices.
            for name,box in [("header",(0,0,image.width,round(image.height*.22))),("footer",(0,round(image.height*.88),image.width,image.height))]:
                crop=image.crop(box);crop=ImageOps.expand(crop,border=20,fill="white")
                r,t=scan(crop,6,name);reads.extend(r);texts.extend(t)
            result.update(reads=reads, text=texts, status="SCANNED")
    except Exception as error:
        result.update(status="ERROR",error=type(error).__name__+": "+str(error)[:180],reads=[],text=[])
    result["elapsedMs"]=round((time.monotonic()-started)*1000)
    return result

def main():
    ROOT.mkdir(parents=True,exist_ok=True)
    products=json.loads((ROOT/"products-snapshot.json").read_text())
    manifest=[]; no_photo=[]
    for p in products:
        photos={}
        cover=p.get("localImageUrl") or p.get("imageUrl")
        if cover and "imagen-no-disponible" not in cover: photos.setdefault(cover,[]).append("PORTADA")
        # localImageUrl is the downloaded representation of the source cover, not an additional photo.
        for m in p["media"]:
            if m["url"] and "imagen-no-disponible" not in m["url"]:photos.setdefault(m["url"],[]).append("GALERIA:"+m["id"])
        for v in p["variants"]:
            if v["imageUrl"] and "imagen-no-disponible" not in v["imageUrl"]:photos.setdefault(v["imageUrl"],[]).append("VARIANTE:"+v["name"])
        if not photos:no_photo.append(p["id"])
        for url,roles in photos.items():
            identity=hashlib.sha256((p["id"]+"\n"+url).encode()).hexdigest()
            manifest.append(dict(id=identity,productId=p["id"],code=p["code"],name=p["name"],imageUrl=url,sourceImageUrl=p.get("sourceImageUrl") if "PORTADA" in roles else None,roles=roles))
    (ROOT/"manifest.json").write_text(json.dumps(dict(version=VERSION,products=len(products),photos=manifest,noPhotoProductIds=no_photo),ensure_ascii=False))
    output=ROOT/"ocr.jsonl"; done=set()
    if output.exists():
        for line in output.read_text().splitlines():
            try:
                row=json.loads(line)
                if row.get("version")==VERSION:done.add(row["id"])
            except json.JSONDecodeError:pass
    pending=[item for item in manifest if item["id"] not in done]
    started=time.monotonic()
    progress=dict(version=VERSION,totalProducts=len(products),totalPhotos=len(manifest),completedPhotos=len(done),noPhotoProducts=len(no_photo),running=True,elapsedSeconds=0)
    with output.open("a",buffering=1) as log, concurrent.futures.ThreadPoolExecutor(max_workers=int(os.environ.get("CATALOG_AUDIT_WORKERS","3"))) as pool:
        for result in pool.map(work,pending):
            log.write(json.dumps(result,ensure_ascii=False)+"\n");done.add(result["id"])
            progress=dict(version=VERSION,totalProducts=len(products),totalPhotos=len(manifest),completedPhotos=len(done),noPhotoProducts=len(no_photo),running=True,elapsedSeconds=round(time.monotonic()-started))
            temp=ROOT/"progress.tmp";temp.write_text(json.dumps(progress));temp.replace(ROOT/"progress.json")
            if len(done)%50==0:print(json.dumps(progress),flush=True)
    progress["running"]=False;progress["finishedAt"]=time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())
    (ROOT/"progress.json").write_text(json.dumps(progress));print(json.dumps(progress),flush=True)

if __name__=="__main__":main()
