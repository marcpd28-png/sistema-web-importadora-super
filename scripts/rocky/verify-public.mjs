import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';
const db = new PrismaClient();
const base = 'https://tiendavirtualsuper.com';
try {
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true } });
  if (!admin || !process.env.AUTH_SECRET) throw new Error('ADMIN_REQUIRED');
  const token = await new SignJWT({ userId: admin.id, email: admin.email, name: admin.name, role: 'ADMIN' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const response = await fetch(`${base}/admin/mensajes/simulador`, { headers: { cookie: `importadora_session=${token}` } });
  const html = await response.text();
  if (response.status !== 200 || !html.includes('ROCKY') || !html.includes('Motor de conversación')) throw new Error('SIMULATOR_HTML_FAILED');
  const assets = [...new Set([...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)].map(m => m[1]))];
  for (const asset of assets) {
    const url = new URL(asset.replaceAll('&amp;', '&'), base);
    if (url.origin !== base) throw new Error('UNEXPECTED_ASSET_ORIGIN');
    const result = await fetch(url, { method: 'HEAD' });
    if (!result.ok) throw new Error(`ASSET_FAILED_${result.status}`);
  }
  const unauthorized = await fetch(`${base}/api/internal/rocky/health`);
  if (unauthorized.status !== 401) throw new Error('INTERNAL_AUTH_FAILED');
  const health = await fetch(`${base}/api/internal/rocky/health`, { headers: { 'x-internal-api-key': process.env.N8N_INTERNAL_API_KEY } });
  const healthResult = await health.json();
  if (!health.ok || !healthResult.ollama?.ready || healthResult.liveSending !== false) throw new Error('HEALTH_FAILED');
  const storefront = await fetch(base);
  console.log(JSON.stringify({ ok: true, simulator: response.status, assetsChecked: assets.length, unauthorized: unauthorized.status, storefront: storefront.status, health: healthResult }, null, 2));
} finally { await db.$disconnect(); }
