import { timingSafeEqual } from "crypto";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { CANDIDATE_SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(request: Request) {
  const jwtSecret = process.env.JWT_SECRET;
  const user = process.env.CANDIDATE_USERNAME;
  const pass = process.env.CANDIDATE_PASSWORD;
  const untilRaw = process.env.CANDIDATE_VALID_UNTIL;

  if (!jwtSecret || !user || !pass || !untilRaw) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const validUntil = new Date(untilRaw);
  if (Number.isNaN(validUntil.getTime())) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const now = Date.now();
  if (now >= validUntil.getTime()) {
    return NextResponse.json({ error: "Access period has expired" }, { status: 401 });
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!safeEqualString(username, user) || !safeEqualString(password, pass)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const maxAge = Math.max(0, Math.floor((validUntil.getTime() - now) / 1000));

  const token = await new SignJWT({ sub: "candidate" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(validUntil)
    .sign(new TextEncoder().encode(jwtSecret));

  const res = NextResponse.json({ ok: true });
  res.cookies.set(CANDIDATE_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
    expires: validUntil,
  });

  return res;
}
