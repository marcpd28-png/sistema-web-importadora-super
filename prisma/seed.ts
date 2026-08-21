import bcrypt from "bcryptjs";
import { Prisma, PrismaClient, TrendDirection, TrendPeriod } from "@prisma/client";

const prisma = new PrismaClient();

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

type DemoSeedProduct = {
  code: string;
  name: string;
  description: string;
  brand: string;
  category: string;
  unitPrice: number;
  wholesalePrice: number | null;
  wholesaleMinQty: number;
  boxPrice: number | null;
  unitsPerBox: number | null;
  stockUnits: number;
  isFeatured: boolean;
  imageUrl: string;
  gallery?: string[];
};

const demoProducts: DemoSeedProduct[] = [
  {
    code: "ACE-001",
    name: "Audífonos Bluetooth TWS Importados",
    description: "Oferta de lanzamiento importada de Shenzhen, China. Estuche cargador compacto, buena rotación para vitrinas de tecnología y venta por mayor.",
    brand: "Shenzhen Link",
    category: "Tecnología",
    unitPrice: 29.9,
    wholesalePrice: 26.5,
    wholesaleMinQty: 3,
    boxPrice: 288,
    unitsPerBox: 12,
    stockUnits: 480,
    isFeatured: true,
    imageUrl: "https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "ARZ-050",
    name: "Power Bank 10000 mAh Tipo C",
    description: "Batería portátil importada de China con doble salida USB. Presentación sellada para mostrador y reparto corporativo.",
    brand: "Guangzhou Power",
    category: "Tecnología",
    unitPrice: 42.9,
    wholesalePrice: 38.5,
    wholesaleMinQty: 3,
    boxPrice: 438,
    unitsPerBox: 12,
    stockUnits: 210,
    isFeatured: false,
    imageUrl: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "AZU-210",
    name: "Cable USB-C Reforzado 1m",
    description: "Cable de carga rápida importado de Yiwu, China. Empaque individual con gancho, ideal para bodegas, cabinas y accesorios móviles.",
    brand: "Yiwu Connect",
    category: "Tecnología",
    unitPrice: 8.5,
    wholesalePrice: 7.25,
    wholesaleMinQty: 3,
    boxPrice: 168,
    unitsPerBox: 24,
    stockUnits: 188,
    isFeatured: false,
    imageUrl: "https://images.unsplash.com/photo-1601972599720-36938d4ecd31?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "FID-320",
    name: "Soporte Magnético para Celular",
    description: "Promoción por caja de accesorio vehicular importado de China, rotación 360 grados y base adhesiva. Alto margen para venta por impulso.",
    brand: "Dragon Mount",
    category: "Tecnología",
    unitPrice: 12.9,
    wholesalePrice: 10.9,
    wholesaleMinQty: 6,
    boxPrice: 238,
    unitsPerBox: 24,
    stockUnits: 432,
    isFeatured: true,
    imageUrl: "https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "ATU-110",
    name: "Parlante Bluetooth Mini RGB",
    description: "Parlante compacto importado de Shenzhen, China, con luz LED y entrada USB. Producto vistoso para campañas de tecnología económica.",
    brand: "NeoSound CN",
    category: "Tecnología",
    unitPrice: 34.9,
    wholesalePrice: 31.5,
    wholesaleMinQty: 6,
    boxPrice: 360,
    unitsPerBox: 12,
    stockUnits: 364,
    isFeatured: false,
    imageUrl: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "GA-112",
    name: "Tira LED RGB 5m con Control",
    description: "Oferta de temporada en iluminación decorativa importada de China. Incluye control remoto, fuente y empaque retail para exhibición en tienda.",
    brand: "Shenzhen Light",
    category: "Iluminación LED",
    unitPrice: 24.9,
    wholesalePrice: 21.9,
    wholesaleMinQty: 6,
    boxPrice: 252,
    unitsPerBox: 12,
    stockUnits: 960,
    isFeatured: true,
    imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "AGU-100",
    name: "Foco LED E27 12W Luz Blanca",
    description: "Promoción mayorista de foco ahorrador importado de China con rosca estándar. Caja master para ferreterías, minimarkets y reposición doméstica.",
    brand: "Pearl LED",
    category: "Iluminación LED",
    unitPrice: 5.9,
    wholesalePrice: 5.1,
    wholesaleMinQty: 12,
    boxPrice: 118,
    unitsPerBox: 24,
    stockUnits: 1240,
    isFeatured: true,
    imageUrl: "https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "JUG-240",
    name: "Lámpara Solar de Jardín",
    description: "Lámpara exterior importada de China con sensor de luz. Ideal para ferreterías, bazares y campañas de hogar.",
    brand: "Solar Dragon",
    category: "Iluminación LED",
    unitPrice: 18.9,
    wholesalePrice: 16.4,
    wholesaleMinQty: 6,
    boxPrice: 188,
    unitsPerBox: 12,
    stockUnits: 292,
    isFeatured: false,
    imageUrl: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "ENE-085",
    name: "Guirnalda LED Decorativa 10m",
    description: "Serie de luces importada de Yiwu, China, para eventos, vitrinas y decoración de temporada. Empaque liviano de alta rotación.",
    brand: "Yiwu Glow",
    category: "Iluminación LED",
    unitPrice: 16.5,
    wholesalePrice: 14.2,
    wholesaleMinQty: 6,
    boxPrice: 160,
    unitsPerBox: 24,
    stockUnits: 288,
    isFeatured: false,
    imageUrl: "https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "LIM-770",
    name: "Organizador Acrílico Transparente",
    description: "Organizador importado de China para cosméticos, escritorio o cocina. Producto visual para exhibición en góndola.",
    brand: "Hangzhou Home",
    category: "Hogar y Cocina",
    unitPrice: 19.9,
    wholesalePrice: 17.5,
    wholesaleMinQty: 4,
    boxPrice: 198,
    unitsPerBox: 12,
    stockUnits: 144,
    isFeatured: false,
    imageUrl: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "DET-410",
    name: "Set de Tapers Herméticos x5",
    description: "Descuento por volumen en juego plástico importado de China con tapas de colores. Pack familiar de buena salida en bazares y tiendas de hogar.",
    brand: "Ningbo Kitchen",
    category: "Hogar y Cocina",
    unitPrice: 22.9,
    wholesalePrice: 19.8,
    wholesaleMinQty: 6,
    boxPrice: 228,
    unitsPerBox: 12,
    stockUnits: 316,
    isFeatured: true,
    imageUrl: "https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "LEJ-180",
    name: "Termo Acero Inoxidable 500ml",
    description: "Termo importado de China con doble pared y tapa hermética. Producto premium económico para campañas escolares y oficina.",
    brand: "Orient Flask",
    category: "Hogar y Cocina",
    unitPrice: 27.9,
    wholesalePrice: 24.5,
    wholesaleMinQty: 12,
    boxPrice: 280,
    unitsPerBox: 12,
    stockUnits: 408,
    isFeatured: false,
    imageUrl: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "ESP-512",
    name: "Mandolina Cortadora Multifunción",
    description: "Utensilio de cocina importado de China con cuchillas intercambiables. Empaque demostrativo para venta por volumen.",
    brand: "Canton Chef",
    category: "Hogar y Cocina",
    unitPrice: 31.9,
    wholesalePrice: 28.4,
    wholesaleMinQty: 3,
    boxPrice: 324,
    unitsPerBox: 12,
    stockUnits: 126,
    isFeatured: false,
    imageUrl: "https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "GAL-888",
    name: "Carrito a Control Remoto 1:24",
    description: "Oferta de campaña infantil en juguete importado de China con control inalámbrico y empaque ventana. Ideal para vitrinas.",
    brand: "Happy Panda",
    category: "Juguetería",
    unitPrice: 39.9,
    wholesalePrice: 34.5,
    wholesaleMinQty: 12,
    boxPrice: 396,
    unitsPerBox: 12,
    stockUnits: 520,
    isFeatured: true,
    imageUrl: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "PAP-330",
    name: "Bloques Armables 120 piezas",
    description: "Promoción escolar en set didáctico importado de China, piezas compatibles y bolsa sellada. Alta rotación para librerías y tiendas de regalo.",
    brand: "Build Joy",
    category: "Juguetería",
    unitPrice: 18.9,
    wholesalePrice: 16.2,
    wholesaleMinQty: 12,
    boxPrice: 186,
    unitsPerBox: 24,
    stockUnits: 612,
    isFeatured: true,
    imageUrl: "https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "CHO-146",
    name: "Muñeca Fashion con Accesorios",
    description: "Muñeca importada de Yiwu, China, con accesorios surtidos. Presentación colorida para góndola y ventas por campaña.",
    brand: "Yiwu Kids",
    category: "Juguetería",
    unitPrice: 24.9,
    wholesalePrice: 21.5,
    wholesaleMinQty: 12,
    boxPrice: 248,
    unitsPerBox: 24,
    stockUnits: 260,
    isFeatured: false,
    imageUrl: "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "CAR-701",
    name: "Pelota Antiestrés Surtida x12",
    description: "Pack de juguetes sensoriales importado de China. Display rentable para caja, librerías y tiendas de novedades.",
    brand: "Fun Dragon",
    category: "Juguetería",
    unitPrice: 15.9,
    wholesalePrice: 13.8,
    wholesaleMinQty: 4,
    boxPrice: 156,
    unitsPerBox: 12,
    stockUnits: 178,
    isFeatured: false,
    imageUrl: "https://images.unsplash.com/photo-1558060370-d644479cb6f7?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "SHA-220",
    name: "Candado de Combinación 4 Dígitos",
    description: "Candado importado de China con cuerpo metálico y clave configurable. Producto básico para ferreterías y bazares.",
    brand: "Ningbo Secure",
    category: "Ferretería ligera",
    unitPrice: 13.9,
    wholesalePrice: 12.1,
    wholesaleMinQty: 3,
    boxPrice: 276,
    unitsPerBox: 12,
    stockUnits: 158,
    isFeatured: false,
    imageUrl: "https://images.unsplash.com/photo-1582139329536-e7284fece509?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "JAB-064",
    name: "Cinta Aislante Negra Pack x10",
    description: "Cinta eléctrica importada de China para reparaciones rápidas. Pack mayorista pensado para ferreterías y técnicos.",
    brand: "Canton Tools",
    category: "Ferretería ligera",
    unitPrice: 11.9,
    wholesalePrice: 10.4,
    wholesaleMinQty: 6,
    boxPrice: 198,
    unitsPerBox: 20,
    stockUnits: 244,
    isFeatured: false,
    imageUrl: "https://images.unsplash.com/photo-1609205807107-e8ec2120f9de?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "CRE-085",
    name: "Guantes de Trabajo Nitrilo Pack x12",
    description: "Oferta por caja en guantes importados de China con palma antideslizante. Rotación estable para almacenes, talleres y construcción ligera.",
    brand: "Work Panda",
    category: "Ferretería ligera",
    unitPrice: 26.9,
    wholesalePrice: 23.8,
    wholesaleMinQty: 12,
    boxPrice: 272,
    unitsPerBox: 24,
    stockUnits: 336,
    isFeatured: true,
    imageUrl: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "VAS-090",
    name: "Vaso PP Transparente 12oz Pack x50",
    description: "Vasos descartables importados de China para juguerías, eventos y delivery. Bolsa sellada con buena presentación.",
    brand: "Guangzhou Pack",
    category: "Descartables",
    unitPrice: 8.9,
    wholesalePrice: 7.6,
    wholesaleMinQty: 12,
    boxPrice: 172,
    unitsPerBox: 24,
    stockUnits: 372,
    isFeatured: false,
    imageUrl: "https://images.unsplash.com/photo-1605600659908-0ef719419d41?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "BOL-150",
    name: "Bolsa Zip Transparente Pack x100",
    description: "Bolsas resellables importadas de China, útiles para empaque, bisutería y repuestos pequeños. Alta demanda por volumen.",
    brand: "Yiwu Pack",
    category: "Descartables",
    unitPrice: 10.9,
    wholesalePrice: 9.4,
    wholesaleMinQty: 6,
    boxPrice: 216,
    unitsPerBox: 24,
    stockUnits: 196,
    isFeatured: false,
    imageUrl: "https://images.unsplash.com/photo-1622015663319-e97e697503ee?auto=format&fit=crop&w=1200&q=80",
  },
  {
    code: "ALU-220",
    name: "Contenedor Rectangular PP x25",
    description: "Envase importado de China para comida, postres y delivery. Formato apilable para restaurantes y negocios pequeños.",
    brand: "Orient Pack",
    category: "Descartables",
    unitPrice: 13.9,
    wholesalePrice: 12.2,
    wholesaleMinQty: 6,
    boxPrice: 140,
    unitsPerBox: 12,
    stockUnits: 164,
    isFeatured: false,
    imageUrl: "https://images.unsplash.com/photo-1610415315876-a061c2c1cb9b?auto=format&fit=crop&w=1200&q=80",
  },
];

const salesTrendSeed = [
  { period: TrendPeriod.WEEK, periodLabel: "Semana actual", periodStart: new Date("2026-04-21"), periodEnd: new Date("2026-04-27"), revenue: 18240, orders: 164, unitsSold: 1328, forecast: 19120 },
  { period: TrendPeriod.WEEK, periodLabel: "Semana anterior", periodStart: new Date("2026-04-14"), periodEnd: new Date("2026-04-20"), revenue: 16980, orders: 149, unitsSold: 1212, forecast: 17540 },
  { period: TrendPeriod.MONTH, periodLabel: "Abril 2026", periodStart: new Date("2026-04-01"), periodEnd: new Date("2026-04-30"), revenue: 73420, orders: 628, unitsSold: 5178, forecast: 78100 },
  { period: TrendPeriod.MONTH, periodLabel: "Marzo 2026", periodStart: new Date("2026-03-01"), periodEnd: new Date("2026-03-31"), revenue: 68110, orders: 574, unitsSold: 4840, forecast: 70200 },
  { period: TrendPeriod.YEAR, periodLabel: "2026", periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-12-31"), revenue: 286400, orders: 2480, unitsSold: 20160, forecast: 335000 },
  { period: TrendPeriod.YEAR, periodLabel: "2025", periodStart: new Date("2025-01-01"), periodEnd: new Date("2025-12-31"), revenue: 241980, orders: 2096, unitsSold: 17820, forecast: 252400 },
];

const productTrendSeed = [
  { period: TrendPeriod.WEEK, periodLabel: "Semana actual", productCode: "GA-112", productName: "Tira LED RGB 5m con Control", unitsSold: 286, deltaPercent: 18.4, momentumScore: 91.2, direction: TrendDirection.RISING },
  { period: TrendPeriod.WEEK, periodLabel: "Semana actual", productCode: "ACE-001", productName: "Audífonos Bluetooth TWS Importados", unitsSold: 214, deltaPercent: 11.3, momentumScore: 84.6, direction: TrendDirection.RISING },
  { period: TrendPeriod.WEEK, periodLabel: "Semana actual", productCode: "ARZ-050", productName: "Power Bank 10000 mAh Tipo C", unitsSold: 96, deltaPercent: -8.7, momentumScore: 41.3, direction: TrendDirection.FALLING },
  { period: TrendPeriod.WEEK, periodLabel: "Semana actual", productCode: "LIM-770", productName: "Organizador Acrílico Transparente", unitsSold: 88, deltaPercent: -12.2, momentumScore: 36.8, direction: TrendDirection.FALLING },
  { period: TrendPeriod.MONTH, periodLabel: "Abril 2026", productCode: "GA-112", productName: "Tira LED RGB 5m con Control", unitsSold: 1098, deltaPercent: 14.1, momentumScore: 90.4, direction: TrendDirection.RISING },
  { period: TrendPeriod.MONTH, periodLabel: "Abril 2026", productCode: "GAL-888", productName: "Carrito a Control Remoto 1:24", unitsSold: 842, deltaPercent: 9.6, momentumScore: 77.2, direction: TrendDirection.RISING },
  { period: TrendPeriod.MONTH, periodLabel: "Abril 2026", productCode: "LIM-770", productName: "Organizador Acrílico Transparente", unitsSold: 364, deltaPercent: -10.4, momentumScore: 38.1, direction: TrendDirection.FALLING },
  { period: TrendPeriod.MONTH, periodLabel: "Abril 2026", productCode: "ARZ-050", productName: "Power Bank 10000 mAh Tipo C", unitsSold: 331, deltaPercent: -6.3, momentumScore: 44.7, direction: TrendDirection.FALLING },
  { period: TrendPeriod.YEAR, periodLabel: "2026", productCode: "GA-112", productName: "Tira LED RGB 5m con Control", unitsSold: 4480, deltaPercent: 22.8, momentumScore: 94.1, direction: TrendDirection.RISING },
  { period: TrendPeriod.YEAR, periodLabel: "2026", productCode: "ACE-001", productName: "Audífonos Bluetooth TWS Importados", unitsSold: 3810, deltaPercent: 15.7, momentumScore: 88.9, direction: TrendDirection.RISING },
  { period: TrendPeriod.YEAR, periodLabel: "2026", productCode: "LIM-770", productName: "Organizador Acrílico Transparente", unitsSold: 1284, deltaPercent: -7.8, momentumScore: 43.1, direction: TrendDirection.FALLING },
  { period: TrendPeriod.YEAR, periodLabel: "2026", productCode: "ARZ-050", productName: "Power Bank 10000 mAh Tipo C", unitsSold: 1206, deltaPercent: -4.2, momentumScore: 47.4, direction: TrendDirection.FALLING },
];

const heroSlidesSeed = [
  {
    imageUrl:
      "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=2400&h=760&q=88",
    title: "Importación directa desde China",
    text: "Contenedores, lotes mayoristas y stock listo para distribuir en tienda.",
  },
  {
    imageUrl:
      "https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=2400&h=760&q=88",
    title: "Almacén con productos por campaña",
    text: "Tecnología, hogar, juguetería y descartables organizados para venta por caja.",
  },
  {
    imageUrl:
      "https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?auto=format&fit=crop&w=2400&h=760&q=88",
    title: "Despacho rápido para distribuidores",
    text: "Pedidos armados para bodegas, bazares y clientes mayoristas.",
  },
  {
    imageUrl:
      "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?auto=format&fit=crop&w=2400&h=760&q=88",
    title: "Cajas, lotes y reposición constante",
    text: "Productos importados con precios por unidad, mayorista y caja master.",
  },
];

const heroBannerSeed: Prisma.HeroBannerCreateManyInput[] = [
  {
    slot: "HERO",
    layout: "HERO_DESKTOP_FULL",
    title: "Importación directa desde China",
    subtitle: "Campaña base del catálogo",
    description: "Contenedores, lotes mayoristas y stock listo para distribuir en tienda.",
    ctaLabel: "Ver catálogo",
    ctaHref: "/",
    desktopImageUrl:
      "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=2400&h=760&q=88",
    mobileImageUrl:
      "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1080&h=1400&q=88",
    altText: "Importación directa desde China",
    overlayColor: "#000000",
    overlayOpacity: 0.36,
    textAlign: "LEFT",
    contentPosition: "LEFT",
    priority: 10,
    sortOrder: 0,
    isActive: true,
    startsAt: null,
    endsAt: null,
    campaignName: "Campaña base",
    analyticsKey: "seed-hero-1",
  },
  {
    slot: "HERO",
    layout: "HERO_DESKTOP_FULL",
    title: "Almacén con productos por campaña",
    subtitle: "Listo para rotación comercial",
    description: "Tecnología, hogar, juguetería y descartables organizados para venta por caja.",
    ctaLabel: "Ofertas",
    ctaHref: "/?featured=1",
    desktopImageUrl:
      "https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=2400&h=760&q=88",
    mobileImageUrl:
      "https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=1080&h=1400&q=88",
    altText: "Almacén con productos por campaña",
    overlayColor: "#000000",
    overlayOpacity: 0.34,
    textAlign: "LEFT",
    contentPosition: "LEFT",
    priority: 8,
    sortOrder: 1,
    isActive: true,
    startsAt: null,
    endsAt: null,
    campaignName: "Rotación",
    analyticsKey: "seed-hero-2",
  },
  {
    slot: "HERO",
    layout: "HERO_DESKTOP_FULL",
    title: "Despacho rápido para distribuidores",
    subtitle: "Más velocidad, menos fricción",
    description: "Pedidos armados para bodegas, bazares y clientes mayoristas.",
    ctaLabel: "Cotizar",
    ctaHref: "/?focus=search",
    desktopImageUrl:
      "https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?auto=format&fit=crop&w=2400&h=760&q=88",
    mobileImageUrl:
      "https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?auto=format&fit=crop&w=1080&h=1400&q=88",
    altText: "Despacho rápido para distribuidores",
    overlayColor: "#000000",
    overlayOpacity: 0.34,
    textAlign: "LEFT",
    contentPosition: "LEFT",
    priority: 6,
    sortOrder: 2,
    isActive: true,
    startsAt: null,
    endsAt: null,
    campaignName: "Distribuidores",
    analyticsKey: "seed-hero-3",
  },
];

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@importadora.local";
  const name = process.env.ADMIN_NAME ?? "Administrador";
  const password = process.env.ADMIN_PASSWORD ?? "admin12345";
  const passwordHash = await bcrypt.hash(password, 10);
  const shopperEmail = process.env.SHOPPER_EMAIL ?? "cliente@importadora.local";
  const shopperName = process.env.SHOPPER_NAME ?? "Cliente Demo";
  const shopperPassword = process.env.SHOPPER_PASSWORD ?? "cliente12345";
  const shopperPasswordHash = await bcrypt.hash(shopperPassword, 10);

  await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role: "ADMIN" },
    create: { email, name, passwordHash, role: "ADMIN" },
  });

  await prisma.user.upsert({
    where: { email: shopperEmail },
    update: {
      name: shopperName,
      phone: "999999999",
      passwordHash: shopperPasswordHash,
      role: "USERSHOP",
    },
    create: {
      email: shopperEmail,
      name: shopperName,
      phone: "999999999",
      passwordHash: shopperPasswordHash,
      role: "USERSHOP",
    },
  });

  // 3 usuarios administrativos adicionales solicitados
  const defaultAdminPassword = "Cambiar12345!";
  const defaultAdminPasswordHash = await bcrypt.hash(defaultAdminPassword, 10);
  const additionalAdmins = [
    { email: "candy@importadora.com", name: "Candy" },
    { email: "kimberlin@importadora.com", name: "Kimberlin" },
    { email: "geydy@importadora.com", name: "Geydy" },
    { email: "adminmark@importadora.com", name: "Admin Mark" },
  ];

  for (const admin of additionalAdmins) {
    await prisma.user.upsert({
      where: { email: admin.email },
      update: {
        name: admin.name,
        passwordHash: defaultAdminPasswordHash,
        role: "ADMIN",
        requirePasswordChange: true,
      },
      create: {
        email: admin.email,
        name: admin.name,
        passwordHash: defaultAdminPasswordHash,
        role: "ADMIN",
        requirePasswordChange: true,
      },
    });
  }

  await prisma.storeSettings.upsert({
    where: { id: 1 },
    update: {
      businessName: "Importaciones Super",
      heroTitle: "Productos importados de China para venta mayorista",
      heroDescription:
        "Compra tecnología, hogar, juguetería, ferretería ligera y descartables con precios por unidad, por mayor y por caja.",
      heroAutoplaySeconds: 5,
      heroSlides: heroSlidesSeed,
      highlightMessage:
        "Stock importado de China con precios por unidad, por mayor desde cantidades mínimas y precio especial por caja.",
    },
    create: {
      id: 1,
      businessName: "Importaciones Super",
      heroTitle: "Productos importados de China para venta mayorista",
      heroDescription:
        "Compra tecnología, hogar, juguetería, ferretería ligera y descartables con precios por unidad, por mayor y por caja.",
      heroAutoplaySeconds: 5,
      heroSlides: heroSlidesSeed,
      highlightMessage:
        "Stock importado de China con precios por unidad, por mayor desde cantidades mínimas y precio especial por caja.",
    },
  });

  if ((await prisma.heroBanner.count({ where: { slot: "HERO" } })) === 0) {
    await prisma.heroBanner.createMany({
      data: heroBannerSeed,
    });
  }

  const categoryMap = new Map<string, string>();
  const demoProductCodes = demoProducts.map((product) => product.code);

  for (const categoryName of Array.from(new Set(demoProducts.map((product) => product.category)))) {
    const category = await prisma.category.upsert({
      where: { name: categoryName },
      update: { slug: slugify(categoryName) },
      create: {
        name: categoryName,
        slug: slugify(categoryName),
      },
    });

    categoryMap.set(categoryName, category.id);
  }

  for (const product of demoProducts) {
    const savedProduct = await prisma.product.upsert({
      where: { code: product.code },
      update: {
        code: product.code,
        name: product.name,
        description: product.description,
        brand: product.brand,
        category: product.category,
        categoryId: categoryMap.get(product.category) ?? null,
        imageUrl: product.imageUrl,
        unitPrice: product.unitPrice,
        wholesalePrice: product.wholesalePrice,
        wholesaleMinQty: product.wholesaleMinQty,
        boxPrice: product.boxPrice,
        unitsPerBox: product.unitsPerBox,
        stockUnits: product.stockUnits,
        isFeatured: product.isFeatured,
        slug: slugify(`${product.name}-${product.code}`),
      },
      create: {
        code: product.code,
        name: product.name,
        description: product.description,
        brand: product.brand,
        category: product.category,
        categoryId: categoryMap.get(product.category) ?? null,
        imageUrl: product.imageUrl,
        unitPrice: product.unitPrice,
        wholesalePrice: product.wholesalePrice,
        wholesaleMinQty: product.wholesaleMinQty,
        boxPrice: product.boxPrice,
        unitsPerBox: product.unitsPerBox,
        stockUnits: product.stockUnits,
        isFeatured: product.isFeatured,
        slug: slugify(`${product.name}-${product.code}`),
      },
    });

    const gallery = [product.imageUrl, ...(product.gallery ?? [])].filter(
      (url, index, urls) => url && urls.indexOf(url) === index,
    );

    await prisma.productMedia.deleteMany({
      where: { productId: savedProduct.id },
    });

    await prisma.productMedia.createMany({
      data: gallery.map((url, index) => ({
        productId: savedProduct.id,
        type: "IMAGE",
        url,
        altText: product.name,
        sortOrder: index,
      })),
    });
  }

  await prisma.product.updateMany({
    where: {
      code: {
        notIn: demoProductCodes,
      },
    },
    data: {
      isVisible: false,
      isFeatured: false,
    },
  });

  await prisma.category.deleteMany({
    where: {
      products: {
        none: {},
      },
    },
  });

  await prisma.salesTrendSnapshot.deleteMany();
  await prisma.productTrendSnapshot.deleteMany();

  for (const snapshot of salesTrendSeed) {
    await prisma.salesTrendSnapshot.create({
      data: snapshot,
    });
  }

  for (const snapshot of productTrendSeed) {
    await prisma.productTrendSnapshot.create({
      data: snapshot,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
