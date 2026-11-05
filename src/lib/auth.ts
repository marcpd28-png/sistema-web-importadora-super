import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "importadora_session";
const SESSION_TTL = 60 * 60 * 24 * 7;
const LOCAL_HOST_PATTERN = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
const PRIVATE_HOST_PATTERN =
  /^(0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(?::\d+)?$/i;

export type SessionUser = {
  userId: string;
  email: string;
  name: string;
  role: "ADMIN" | "ASESOR" | "USERSHOP" | "PROMOTOR";
  requirePasswordChange?: boolean;
};

/**
 * Customer messaging is available to every active administrator. Keeping the
 * permission check centralised means its navigation, pages, server actions and
 * API routes all follow the same role rule.
 */
export function canManageMessaging(
  session: Pick<SessionUser, "email" | "role" | "requirePasswordChange"> | null | undefined,
) {
  return Boolean(
    session &&
    session.role === "ADMIN" &&
    !session.requirePasswordChange,
  );
}

/**
 * Advisors can work directly with customer conversations, but must not gain
 * access to message configuration, integrations, automations, or simulations.
 * Those controls remain reserved for administrators.
 */
export function canUseMessageCenter(
  session: Pick<SessionUser, "email" | "role" | "requirePasswordChange"> | null | undefined,
) {
  return Boolean(
    session &&
      !session.requirePasswordChange &&
      (session.role === "ASESOR" || canManageMessaging(session)),
  );
}

export function canManageQuotes(
  session: Pick<SessionUser, "role" | "requirePasswordChange"> | null | undefined,
) {
  return Boolean(
    session &&
      !session.requirePasswordChange &&
      (session.role === "ADMIN" || session.role === "ASESOR"),
  );
}

function getSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("AUTH_SECRET no está configurado.");
  }

  return new TextEncoder().encode(secret);
}

async function shouldUseSecureCookies() {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "";
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const origin = headerStore.get("origin");
  const referer = headerStore.get("referer");

  if (process.env.AUTH_COOKIE_SECURE === "true") {
    return true;
  }

  if (LOCAL_HOST_PATTERN.test(host) || PRIVATE_HOST_PATTERN.test(host)) {
    return false;
  }

  if (forwardedProto) {
    return forwardedProto === "https";
  }

  for (const headerValue of [origin, referer]) {
    if (!headerValue) {
      continue;
    }

    try {
      const url = new URL(headerValue);

      if (LOCAL_HOST_PATTERN.test(url.host) || PRIVATE_HOST_PATTERN.test(url.host)) {
        return false;
      }

      return url.protocol === "https:";
    } catch {
      continue;
    }
  }

  return false;
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  const secure = await shouldUseSecureCookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete({
    name: SESSION_COOKIE,
    path: "/",
  });
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());

    if (
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      (payload.role !== "ADMIN" &&
        payload.role !== "ASESOR" &&
        payload.role !== "USERSHOP" &&
        payload.role !== "PROMOTOR")
    ) {
      return null;
    }

    // The token establishes identity, while the database remains the source of
    // truth for the current role. This makes a role downgrade take effect on
    // the next request instead of leaving a seven-day ADMIN JWT usable.
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        requirePasswordChange: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      requirePasswordChange: user.requirePasswordChange,
    } satisfies SessionUser;
  } catch {
    return null;
  }
}

export async function requireAdmin() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "ADMIN") {
    redirect(session.role === "ASESOR" ? "/asesor" : "/cuenta");
  }

  return session;
}

/**
 * Use in Route Handlers that need an API-friendly administrator authorization
 * check. Callers can return a controlled 403 without relying on redirect()
 * control flow.
 */
export async function getMessagingOwnerSession(): Promise<SessionUser | null> {
  const session = await getSession();
  return canManageMessaging(session) ? session : null;
}

/**
 * API-friendly guard for the advisor inbox. It deliberately has a narrower
 * scope than the owner guard above, so sensitive message-center controls stay
 * unavailable to advisors.
 */
export async function getMessageCenterSession(): Promise<SessionUser | null> {
  const session = await getSession();
  return canUseMessageCenter(session) ? session : null;
}

/**
 * Use in pages and Server Actions that manage customer messaging. All active
 * administrators have this access; other roles remain outside this area.
 */
export async function requireMessagingOwner() {
  const session = await requireAdmin();

  if (!canManageMessaging(session)) {
    redirect("/admin?error=messaging_access_denied");
  }

  return session;
}

export async function requireAdvisor() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "ASESOR") {
    redirect(session.role === "ADMIN" ? "/admin" : "/cuenta");
  }

  return session;
}

export async function requireQuoteManager() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (!canManageQuotes(session)) {
    redirect(session.role === "ASESOR" ? "/asesor" : session.role === "ADMIN" ? "/admin" : "/cuenta");
  }

  return session;
}

export async function requireShopper() {
  const session = await getSession();

  if (!session) {
    redirect("/acceso");
  }

  if (session.role !== "USERSHOP" && session.role !== "PROMOTOR") {
    redirect(session.role === "ASESOR" ? "/asesor" : "/admin");
  }

  return session;
}

export async function redirectIfAuthenticated() {
  const session = await getSession();

  if (session) {
    redirect(session.role === "ADMIN" ? "/admin" : session.role === "ASESOR" ? "/asesor" : "/cuenta");
  }
}
