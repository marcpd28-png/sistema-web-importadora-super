import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "importadora_session";
const SESSION_TTL = 60 * 60 * 24 * 7;
const LOCAL_HOST_PATTERN = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
const PRIVATE_HOST_PATTERN =
  /^(0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(?::\d+)?$/i;

export type SessionUser = {
  userId: string;
  email: string;
  name: string;
  role: "ADMIN" | "USERSHOP";
  requirePasswordChange?: boolean;
};

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
      (payload.role !== "ADMIN" && payload.role !== "USERSHOP")
    ) {
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      requirePasswordChange: Boolean(payload.requirePasswordChange),
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
    redirect("/cuenta");
  }

  return session;
}

export async function requireShopper() {
  const session = await getSession();

  if (!session) {
    redirect("/acceso");
  }

  if (session.role !== "USERSHOP") {
    redirect("/admin");
  }

  return session;
}

export async function redirectIfAuthenticated() {
  const session = await getSession();

  if (session) {
    redirect(session.role === "ADMIN" ? "/admin" : "/cuenta");
  }
}
