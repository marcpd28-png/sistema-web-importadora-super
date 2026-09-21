import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
if (!process.argv.includes('--execute')) throw new Error('EXPLICIT_SNAPSHOT_REQUIRED');
const directory = process.env.CATALOG_AUDIT_DIR || '/home/IMPORTADORA-audits/catalog-images';
const file = path.join(directory, 'products-snapshot.json');
try { await access(file); throw new Error('SNAPSHOT_EXISTS_USE_A_NEW_AUDIT_DIRECTORY'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const db = new PrismaClient();
try {
  const products = await db.product.findMany({ select: { id: true, code: true, name: true, slug: true, category: true, isVisible: true, stockUnits: true, imageUrl: true, localImageUrl: true, sourceImageUrl: true, sourceImageContentHash: true, updatedAt: true, media: { where: { type: 'IMAGE' }, select: { id: true, url: true, altText: true } }, variants: { select: { id: true, name: true, imageUrl: true } } }, orderBy: { code: 'asc' } });
  await mkdir(directory, { recursive: true });
  await writeFile(file, JSON.stringify(products), { flag: 'wx' });
  console.log(JSON.stringify({ products: products.length, snapshotAt: new Date().toISOString() }));
} finally { await db.$disconnect(); }
