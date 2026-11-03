import { z } from "zod";
import {
  HERO_BANNER_CONTENT_POSITION_VALUES,
  HERO_BANNER_LAYOUT_VALUES,
  HERO_BANNER_SLOT_VALUES,
  HERO_BANNER_TEXT_ALIGN_VALUES,
} from "@/lib/hero-banners";
import { isTruthy } from "@/lib/utils";

function isLocalOrAbsoluteUrl(value: string) {
  if (!value.trim()) {
    return false;
  }

  if (value.startsWith("/")) {
    return true;
  }

  try {
    return Boolean(new URL(value));
  } catch {
    return false;
  }
}

const urlOrPathSchema = z
  .string()
  .trim()
  .refine(isLocalOrAbsoluteUrl, {
    message: "La URL debe ser válida o una ruta local que empiece con /.",
  });

const optionalUrlOrPathSchema = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }

    return String(value).trim();
  },
  urlOrPathSchema.optional(),
);

const optionalText = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .optional();

const optionalPhone = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }

    return String(value).trim();
  },
  z
    .string()
    .min(7, "El teléfono debe tener al menos 7 dígitos.")
    .max(32, "El teléfono es demasiado largo.")
    .optional(),
);

const numericOptional = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  return Number(value);
}, z.number().positive().optional());

const intOptional = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  return Number(value);
}, z.number().int().positive().optional());

export const productMediaEntrySchema = z.object({
  type: z.enum(["IMAGE", "VIDEO"]),
  url: urlOrPathSchema,
  altText: optionalText,
});

export const productMediaListSchema = z
  .array(productMediaEntrySchema)
  .max(8, "Puedes adjuntar hasta 8 fotos o videos por producto.");

export const heroSlideEntrySchema = z.object({
  imageUrl: urlOrPathSchema,
  title: optionalText,
  text: optionalText,
});

export const heroSlidesSchema = z
  .array(heroSlideEntrySchema)
  .max(6, "Puedes configurar hasta 6 slides en el hero.");

const optionalDateTime = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  const parsed = new Date(String(value));

  return Number.isNaN(parsed.getTime()) ? value : parsed;
}, z.date().optional());

export const heroBannerSchema = z.object({
  bannerId: z.string().trim().optional().default(""),
  slot: z.enum(HERO_BANNER_SLOT_VALUES).default("HERO"),
  layout: z.enum(HERO_BANNER_LAYOUT_VALUES).default("HERO_DESKTOP_FULL"),
  title: optionalText,
  subtitle: optionalText,
  description: optionalText,
  ctaLabel: optionalText,
  ctaHref: optionalText,
  desktopImageUrl: optionalUrlOrPathSchema,
  mobileImageUrl: optionalUrlOrPathSchema,
  altText: optionalText,
  overlayColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/),
  overlayOpacity: z.coerce.number().min(0).max(1),
  textAlign: z.enum(HERO_BANNER_TEXT_ALIGN_VALUES).default("LEFT"),
  contentPosition: z.enum(HERO_BANNER_CONTENT_POSITION_VALUES).default("LEFT"),
  priority: z.coerce.number().int(),
  sortOrder: z.coerce.number().int(),
  campaignName: optionalText,
  analyticsKey: optionalText,
  startsAt: optionalDateTime,
  endsAt: optionalDateTime,
  isActive: z.boolean().default(true),
}).superRefine((value, ctx) => {
  const desktopImageUrl = value.desktopImageUrl?.trim() ?? "";
  const mobileImageUrl = value.mobileImageUrl?.trim() ?? "";

  if (!desktopImageUrl && !mobileImageUrl) {
    ctx.addIssue({
      code: "custom",
      message: "Debes subir al menos una imagen para desktop o mobile.",
      path: ["desktopImageUrl"],
    });
  }
});

export const loginSchema = z.object({
  email: z.string().trim().email("Correo inválido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
});

export const shopperRegisterSchema = z
  .object({
    name: z.string().trim().min(3, "Tu nombre debe tener al menos 3 caracteres."),
    email: z.string().trim().email("Correo inválido."),
    phone: z
      .string()
      .trim()
      .min(7, "El teléfono debe tener al menos 7 dígitos.")
      .max(32, "El teléfono es demasiado largo."),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
    confirmPassword: z.string().min(6, "Confirma tu contraseña."),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        message: "Las contraseñas no coinciden.",
        path: ["confirmPassword"],
      });
    }
  });

export const adminUserSchema = z
  .object({
    name: z.string().trim().min(3, "El nombre debe tener al menos 3 caracteres."),
    email: z.string().trim().email("Correo inválido."),
    phone: optionalPhone,
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
    confirmPassword: z.string().min(6, "Confirma la contraseña."),
    role: z.enum(["ADMIN", "ASESOR", "USERSHOP", "PROMOTOR"]),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        message: "Las contraseñas no coinciden.",
        path: ["confirmPassword"],
      });
    }
  });

export const adminUserUpdateSchema = z
  .object({
    name: z.string().trim().min(3, "El nombre debe tener al menos 3 caracteres."),
    email: z.string().trim().email("Correo inválido."),
    phone: optionalPhone,
    password: z.string().trim().optional().or(z.literal("")),
    confirmPassword: z.string().trim().optional().or(z.literal("")),
    role: z.enum(["ADMIN", "ASESOR", "USERSHOP", "PROMOTOR"]),
  })
  .superRefine((value, ctx) => {
    const password = value.password?.trim() ?? "";
    const confirmPassword = value.confirmPassword?.trim() ?? "";

    if ((password && !confirmPassword) || (!password && confirmPassword)) {
      ctx.addIssue({
        code: "custom",
        message: "Debes completar y confirmar la nueva contraseña.",
        path: ["confirmPassword"],
      });
    }

    if (password && confirmPassword && password !== confirmPassword) {
      ctx.addIssue({
        code: "custom",
        message: "Las contraseñas no coinciden.",
        path: ["confirmPassword"],
      });
    }
  });

export const productSchema = z
  .object({
    code: z.string().trim().min(2, "El código es obligatorio."),
    name: z.string().trim().min(3, "El nombre es obligatorio."),
    description: optionalText,
    technicalSpecs: optionalText,
    brand: optionalText,
    categoryId: optionalText,
    imageUrl: optionalUrlOrPathSchema,
    unitLabel: z.string().trim().min(2).max(40),
    unitPrice: z.coerce.number().positive("El precio unitario debe ser mayor a cero."),
    wholesalePrice: numericOptional,
    wholesaleMinQty: z.coerce.number().int().min(2).default(3),
    boxPrice: numericOptional,
    unitsPerBox: intOptional,
    stockUnits: z.coerce.number().int().min(0),
    isVisible: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.wholesalePrice && value.wholesalePrice > value.unitPrice) {
      ctx.addIssue({
        code: "custom",
        message: "El precio mayorista no puede ser mayor al unitario.",
        path: ["wholesalePrice"],
      });
    }

    if (value.boxPrice && !value.unitsPerBox) {
      ctx.addIssue({
        code: "custom",
        message: "Debes indicar cuántas unidades trae cada cajón.",
        path: ["unitsPerBox"],
      });
    }
  });

export const settingsSchema = z.object({
  businessName: z.string().trim().min(2),
  heroTitle: z.string().trim().min(6),
  heroDescription: z.string().trim().min(12),
  heroAutoplaySeconds: z.coerce.number().int().min(2).max(20),
  heroSlides: heroSlidesSchema,
  whatsappNumber: z.string().trim().min(8),
  orderIntro: z.string().trim().min(6),
  orderFooter: z.string().trim().min(6),
  currencySymbol: z.string().trim().min(1).max(5),
  highlightMessage: z.string().trim().min(6),
  supportHours: z.string().trim().min(4),
  primaryColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/),
  accentColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2, "La categoría debe tener al menos 2 caracteres.").max(120),
});

export function parseLoginForm(formData: FormData) {
  return loginSchema.parse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
}

export function parseShopperRegisterForm(formData: FormData) {
  return shopperRegisterSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
}

export function parseAdminUserForm(formData: FormData) {
  return adminUserSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    role: formData.get("role"),
  });
}

export function parseAdminUserUpdateForm(formData: FormData) {
  return adminUserUpdateSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    role: formData.get("role"),
  });
}

export function parseProductForm(formData: FormData) {
  return productSchema.parse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description"),
    technicalSpecs: formData.get("technicalSpecs"),
    brand: formData.get("brand"),
    categoryId: formData.get("categoryId"),
    imageUrl: formData.get("imageUrl"),
    unitLabel: formData.get("unitLabel"),
    unitPrice: formData.get("unitPrice"),
    wholesalePrice: formData.get("wholesalePrice"),
    wholesaleMinQty: formData.get("wholesaleMinQty"),
    boxPrice: formData.get("boxPrice"),
    unitsPerBox: formData.get("unitsPerBox"),
    stockUnits: formData.get("stockUnits"),
    isVisible: isTruthy(formData.get("isVisible")),
    isFeatured: isTruthy(formData.get("isFeatured")),
  });
}

export function parseCategoryForm(formData: FormData) {
  return categorySchema.parse({
    name: formData.get("name"),
  });
}

export function parseSettingsForm(formData: FormData) {
  const primaryColor = formData.get("primaryColor");
  const heroSlideImageUrls = formData.getAll("heroSlideImageUrl").map(String);
  const heroSlideTitles = formData.getAll("heroSlideTitle").map(String);
  const heroSlideTexts = formData.getAll("heroSlideText").map(String);
  const heroSlides = heroSlideImageUrls
    .map((imageUrl, index) => ({
      imageUrl,
      title: heroSlideTitles[index] ?? "",
      text: heroSlideTexts[index] ?? "",
    }))
    .filter((slide) => slide.imageUrl.trim() || slide.title.trim() || slide.text.trim());

  return settingsSchema.parse({
    businessName: formData.get("businessName"),
    heroTitle: formData.get("heroTitle"),
    heroDescription: formData.get("heroDescription"),
    heroAutoplaySeconds: formData.get("heroAutoplaySeconds"),
    heroSlides,
    whatsappNumber: formData.get("whatsappNumber"),
    orderIntro: formData.get("orderIntro"),
    orderFooter: formData.get("orderFooter"),
    currencySymbol: formData.get("currencySymbol"),
    highlightMessage: formData.get("highlightMessage"),
    supportHours: formData.get("supportHours"),
    primaryColor,
    accentColor: primaryColor,
  });
}

export function parseHeroBannerForm(formData: FormData) {
  return heroBannerSchema.parse({
    bannerId: formData.get("bannerId"),
    slot: formData.get("slot"),
    layout: formData.get("layout"),
    title: formData.get("title"),
    subtitle: formData.get("subtitle"),
    description: formData.get("description"),
    ctaLabel: formData.get("ctaLabel"),
    ctaHref: formData.get("ctaHref"),
    desktopImageUrl: formData.get("desktopImageUrl"),
    mobileImageUrl: formData.get("mobileImageUrl"),
    altText: formData.get("altText"),
    overlayColor: formData.get("overlayColor"),
    overlayOpacity: formData.get("overlayOpacity"),
    textAlign: formData.get("textAlign"),
    contentPosition: formData.get("contentPosition"),
    priority: formData.get("priority"),
    sortOrder: formData.get("sortOrder"),
    campaignName: formData.get("campaignName"),
    analyticsKey: formData.get("analyticsKey"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    isActive: isTruthy(formData.get("isActive")),
  });
}
