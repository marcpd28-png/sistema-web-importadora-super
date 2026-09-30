import { permanentRedirect } from "next/navigation";
import { canonicalCategorySlug } from "@/lib/storefront-taxonomy";
export default async function CategoryPage({ params, searchParams }: { params: Promise<{slug: string}>; searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const [{slug}, query] = await Promise.all([params, searchParams]);
  const destination = new URLSearchParams();
  for (const [key,value] of Object.entries(query)) if (typeof value === "string") destination.set(key,value);
  destination.set("category", canonicalCategorySlug(slug));
  permanentRedirect('/?' + destination.toString());
}
