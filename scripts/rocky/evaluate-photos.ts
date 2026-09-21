import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "../../src/lib/prisma";
import { identifyCatalogImageCodes } from "../../src/lib/rocky/image-codes";
import { matchCatalogImageText } from "../../src/lib/router-v2-local-ocr";
async function main() {
 const directory = process.env.ROCKY_PHOTO_EVAL_DIR || "/var/log/rocky/ocr-evaluation";
 await mkdir(directory, { recursive: true });
 const manifestPath = path.join(directory, "fixtures.json");
 let fixtures: { code: string; category: string | null; file: string }[];
 try { fixtures = JSON.parse(await readFile(manifestPath, "utf8")); }
 catch {
  const products = await prisma.product.findMany({ where: { isVisible: true, sourceImageContentHash: { not: null } }, select: { code: true, category: true, localImageUrl: true, imageUrl: true, sourceImageContentHash: true }, orderBy: { code: "asc" } });
  const seen = new Set<string>(); const counts = new Map<string, number>(); fixtures=[];
  for (const product of products) {
   const category=product.category || "";if ((counts.get(category)||0)>=2 || seen.has(product.sourceImageContentHash!)) continue;
   const url=[product.localImageUrl,product.imageUrl].find(url=>url?.startsWith("/uploads/"));if(!url)continue;
   const root="/home/IMPORTADORA/public/uploads";const file=path.resolve(root,url.slice("/uploads/".length));if(!file.startsWith(root+"/"))continue;
   try {
    const image=await readFile(file);const metadata=await sharp(image).metadata();if(!metadata.width || !metadata.height || metadata.height<metadata.width*1.2)continue;
    const resized=await sharp(image).rotate().resize({height:500,withoutEnlargement:true}).extend({top:12,bottom:12,left:12,right:12,background:"#eeeeee"}).jpeg({quality:75}).toBuffer();
    const output=path.join(directory,`photo-${fixtures.length}.jpg`);await writeFile(output,resized);fixtures.push({code:product.code,category:product.category,file:output});seen.add(product.sourceImageContentHash!);counts.set(category,(counts.get(category)||0)+1);
    if(fixtures.length>=24)break;
   } catch { /* Keep evaluating readable local product cards. */ }
  }
  await writeFile(manifestPath,JSON.stringify(fixtures,null,2));
 }
 const visibleCodes=(await prisma.product.findMany({where:{isVisible:true},select:{code:true,name:true}}));
 let matched=0;let wrong=0;
 for(const fixture of fixtures){const started=Date.now();const data="data:image/jpeg;base64,"+(await readFile(fixture.file)).toString("base64");const result=process.env.ROCKY_OCR_NEW === "true" ? await identifyCatalogImageCodes(data,visibleCodes) : await matchCatalogImageText(data,code=>prisma.product.findMany({where:{isVisible:true,code:{equals:code,mode:"insensitive"}},select:{code:true},take:2}));const actual=result?.hints.code || null;const ok=actual===fixture.code;if(ok)matched++;else if(actual)wrong++;console.log(JSON.stringify({sourceProductCode:fixture.code,actual,sourceCodeEqualsRead:ok,category:fixture.category,...(result && "codes" in result ? {status:result.status,candidates:result.codes} : {}),elapsedMs:Date.now()-started}));}
 console.log(JSON.stringify({total:fixtures.length,sourceCodeEqualsRead:matched,readDifferentFromSourceCode:wrong,unresolved:fixtures.length-matched-wrong,note:"Source ERP codes are not OCR ground truth; inspect printed labels and aliases."}));
 await prisma.$disconnect();
}
void main();
