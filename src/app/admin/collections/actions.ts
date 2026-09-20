"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAMPAIGN_SLUGS, parseCampaignCodes } from "@/lib/storefront-campaigns";
import { buildSellableProductWhere } from "@/lib/store-shared";

export async function searchCampaignProducts(query: string, page = 0) {
  await requireAdmin();
  const search = query.trim().slice(0, 120);
  const currentPage = Number.isSafeInteger(page) ? Math.max(0, Math.min(page, 10000)) : 0;
  const products = await prisma.product.findMany({
    where: search ? { OR: [
      { code: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ] } : {},
    select: { code: true, name: true, stockUnits: true, isVisible: true },
    orderBy: [{ name: "asc" }, { code: "asc" }],
    skip: currentPage * 20,
    take: 21,
  });
  return { products: products.slice(0, 20), hasMore: products.length > 20 };
}

export async function saveCampaignAction(_previous: { error: string }, formData: FormData) {
  await requireAdmin();
  const slug = String(formData.get("slug") ?? "");
  if (!CAMPAIGN_SLUGS.some(value => value === slug)) throw new Error("Colección no válida.");
  const codes = parseCampaignCodes(String(formData.get("codes") ?? ""));
  const enabled = formData.get("enabled") === "on";
  const description = String(formData.get("description") ?? "").trim();
  let error = "";
  if (codes.length > 500 || codes.some(code => code.length > 64) || description.length > 2000) {
    error = "Máximo 500 códigos de 64 caracteres y 2000 caracteres de descripción.";
  } else {
    const matches = await prisma.product.findMany({ where: { code: { in: codes } }, select: { code: true } });
    const found = new Set(matches.map(item => item.code));
    const missing = codes.filter(code => !found.has(code));
    if (missing.length) error = `Códigos no encontrados: ${missing.slice(0, 10).join(", ")}. Usa el código exacto del catálogo.`;
    if (enabled && (!codes.length || !description)) error = "Para activar, agrega productos y las condiciones de la campaña.";
    if (enabled && !error) {
      const count = await prisma.product.count({ where: { AND: [buildSellableProductWhere(), { code: { in: codes } }] } });
      if (!count) error = "No hay productos publicables: revisa visibilidad y fotografías.";
    }
  }
  if (error) return { error };
  // Optimistic concurrency prevents one admin from silently replacing another's list.
  const version = String(formData.get("version") ?? "");
  const data = { enabled, description, productCodes: codes };
  try {
    if (version) {
      const result = await prisma.storefrontCampaign.updateMany({ where: { slug, updatedAt: new Date(version) }, data });
      if (!result.count) error = "Otro administrador modificó esta colección. Recarga y revisa antes de guardar.";
    } else {
      await prisma.storefrontCampaign.create({ data: { slug, ...data } });
    }
  } catch { error = "No se pudo guardar. Recarga la página y vuelve a intentarlo."; }
  if (error) return { error };
  revalidatePath("/", "layout");
  redirect("/admin/collections?saved=1");
}
