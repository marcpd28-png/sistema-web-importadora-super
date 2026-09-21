"""Bounded local OCR. Catalog keys validate text; they never repair characters."""
import base64, io, json, re, subprocess, sys, time, warnings
from PIL import Image, ImageOps
warnings.simplefilter("error", Image.DecompressionBombWarning)
Image.MAX_IMAGE_PIXELS = 12_000_000
started = time.monotonic()
payload = json.loads(sys.stdin.buffer.read(6_000_001))
data = base64.b64decode(payload["image"], validate=True)
if len(data) > 4_194_304: raise ValueError("image limit")
known = set(payload["keys"])
reads = []
texts = []
spots = []

def key(value):
    return re.sub(r"\s+", "", value.upper().replace("(", "").replace(")", "")).rstrip(".,;:")

def scan(image, mode, name, crop=False):
    remaining = 18 - (time.monotonic() - started)
    if remaining < .5: return
    buf = io.BytesIO(); image.save(buf, format="PNG")
    try:
        result = subprocess.run(["/usr/bin/tesseract", "stdin", "stdout", "-l", "eng", "--psm", str(mode), "tsv"], input=buf.getvalue(), capture_output=True, timeout=min(3, remaining), check=True)
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError): return
    lines = {}; words = []
    for row in result.stdout.decode("utf-8").splitlines()[1:]:
        f = row.split("\t")
        if len(f) != 12 or f[0] != "5" or not f[11].strip(): continue
        word = {"text": f[11], "x": int(f[6]), "y": int(f[7]), "w": int(f[8]), "h": int(f[9]), "conf": float(f[10])}
        words.append(word); lines.setdefault(tuple(f[1:5]), []).append(word)
    for line in lines.values():
        meaningful=[w for w in line if re.search(r"[A-Za-z0-9]",w["text"])]
        if meaningful:
            texts.append({"text":" ".join(w["text"] for w in meaningful),"confidence":sum(w["conf"] for w in meaningful)/len(meaningful),"view":name})
        for i in range(len(line)):
            for count in range(1, min(3, len(line)-i)+1):
                group=line[i:i+count]
                if any(b["x"]-a["x"]-a["w"] > max(a["h"], b["h"])*3 for a,b in zip(group,group[1:])): continue
                code=key("".join(w["text"] for w in group))
                if code not in known: continue
                x=min(w["x"] for w in group); y=min(w["y"] for w in group)
                right=max(w["x"]+w["w"] for w in group); bottom=max(w["y"]+w["h"] for w in group)
                labeled=any(re.match(r"^(?:c[oó0]dig[o0]|cod|sku)[:.]?$", w["text"], re.I) and abs(w["x"]-x)<max(right-x, w["w"])*2 and abs(w["y"]-y)<max(w["h"],bottom-y)*6 for w in words)
                if (code.isdigit() or not any(c.isdigit() for c in code)) and not labeled and not crop: continue
                confidence=min(w["conf"] for w in group)
                reads.append({"code":code,"confidence":confidence,"view":name,"labeled":labeled})
                if not crop and len(spots)<16:
                    spots.append((confidence, code, image, (max(0,x-6),max(0,y-6),min(image.width,right+6),min(image.height,bottom+6))))

def enough():
    groups={}
    for r in reads:
        if r["confidence"]>=70: groups.setdefault(r["code"],set()).add(r["view"])
    return any(len(v)>=2 for v in groups.values())

with Image.open(io.BytesIO(data)) as source:
    image=ImageOps.exif_transpose(source).convert("RGB")
    image.thumbnail((1800,1800))
    if max(image.size)<1200:
        scale=min(3,1600/max(image.size));image=image.resize((round(image.width*scale),round(image.height*scale)),Image.Resampling.LANCZOS)
    scan(image,11,"full-11");scan(image,6,"full-6")
    # Cards often place the code in a small header or footer. Stretch condensed lettering.
    for name,box in [("header",(0,0,image.width,round(image.height*.32))),("footer",(0,round(image.height*.78),image.width,image.height))]:
        region=image.crop(box);region=ImageOps.grayscale(region.resize((min(2400,round(region.width*1.5)),region.height),Image.Resampling.LANCZOS))
        scan(region,6,name)
    for name,box in [("header-right",(round(image.width*.5),0,image.width,round(image.height*.3))),("header-left",(0,0,round(image.width*.5),round(image.height*.3))),("footer-right",(round(image.width*.5),round(image.height*.8),image.width,image.height))]:
        region=image.crop(box)
        region=ImageOps.expand(ImageOps.grayscale(region),border=25,fill=255)
        scan(region,6,name+"-6");scan(region,11,name+"-11")
    if not enough():
        for name,box in [("label-right",(round(image.width*.72),0,image.width,round(image.height*.16))),("label-left",(0,0,round(image.width*.49),round(image.height*.14))),("label-footer",(0,round(image.height*.93),image.width,image.height))]:
            region=image.crop(box)
            # Color channels recover white-on-blue and orange-on-white label contrast.
            for channel in [0,2]:
                mono=ImageOps.autocontrast(region.getchannel(channel)).point(lambda p:255 if p>150 else 0)
                mono=ImageOps.expand(mono,border=25,fill=255)
                scan(mono,6,name+"-channel-"+str(channel))
    done=set()
    for confidence,code,view,box in sorted(spots,key=lambda item:item[0],reverse=True):
        if code in done: continue
        done.add(code)
        if len(done)>3:break
        region=view.crop(box);region=ImageOps.grayscale(region.resize((region.width*2,round(region.height*4/3)),Image.Resampling.LANCZOS));region=ImageOps.expand(region,border=30,fill=255)
        scan(region,6,"crop-6-"+code,True);scan(region,7,"crop-7-"+code,True)
        threshold=ImageOps.autocontrast(region).point(lambda p:255 if p>150 else 0)
        scan(threshold,7,"crop-threshold-"+code,True)
    if not enough():
        for angle in [90,270]:
            rotated=image.rotate(angle,expand=True);scan(rotated,11,"rotate-"+str(angle));scan(rotated,6,"rotate-block-"+str(angle))
print(json.dumps({"reads":reads[:200],"text":texts[:350]}) if payload.get("includeText") else json.dumps(reads[:200]))
