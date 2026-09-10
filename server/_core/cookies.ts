import type { CookieOptions, Request } from "express";

export function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");
  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  _req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // Enterprise session hardening: HttpOnly + Secure + SameSite=Strict.
  // The OAuth callback that mints this cookie is a same-site navigation to
  // /api/oauth/callback (redirectUri = window.location.origin + path), so the
  // Set-Cookie response is first-party and Strict does not break login.
  // Defense in depth: nonce-cookie state check + CSRF origin guard in
  // security.ts still apply on top of Strict.
  return {
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: true,
  };
}
