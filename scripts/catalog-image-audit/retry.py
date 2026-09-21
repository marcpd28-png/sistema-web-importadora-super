"""Retry errors after the exhaustive pass, preserving every original record."""
import json
from scan import ROOT, work

latest={}
for line in (ROOT/"ocr.jsonl").read_text().splitlines():
    row=json.loads(line);latest[row["id"]]=row
products={p["id"]:p for p in json.loads((ROOT/"products-snapshot.json").read_text())}
with (ROOT/"ocr.jsonl").open("a",buffering=1) as output:
    for row in latest.values():
        if row["status"]!="ERROR":continue
        item={key:row[key] for key in ["id","productId","code","name","imageUrl","roles"]}
        item["sourceImageUrl"]=products[row["productId"]].get("sourceImageUrl") if "PORTADA" in row["roles"] else None
        result=work(item);output.write(json.dumps(result,ensure_ascii=False)+"\n");print(json.dumps({"code":row["code"],"status":result["status"],"error":result.get("error")}),flush=True)
