import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";
import { persistAuthIntent } from "@/lib/legalDisclosure";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Start the renter login flow. Call this from an event handler or effect at the
// moment you want to navigate, e.g. `onClick={() => startLogin()}`.
//
// When the external OAuth portal is configured this starts the Manus OAuth
// login. It has SIDE EFFECTS — it mints a one-time nonce, writes the __Host-
// state cookie, and navigates immediately — so the cookie nonce always matches
// the `state` it sends. Do NOT call it during render (no `href={startLogin()}` /
// `loginUrl={...}`): each call overwrites the cookie, so a stray render-phase
// call would desync it from an in-flight login and the callback would reject it
// with "invalid oauth state". It returns void by design, so there is no URL to
// stash across renders.
//
// With NO OAuth portal configured, it falls back to the PUBLIC native renter
// login page `/login` (no auth-intent marker needed — the page is public).
export const startLogin = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  if (!oauthPortalUrl || !appId) {
    window.location.href = "/login";
    return;
  }
  const redirectUri = `${window.location.origin}/api/oauth/callback`;

  const nonce = crypto.randomUUID();
  document.cookie = `${OAUTH_STATE_COOKIE}=${nonce}; Path=/; Max-Age=600; SameSite=None; Secure`;
  const state = encodeOAuthState({ redirectUri, nonce });

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  window.location.href = url.toString();
};

// Start the OWNER login flow (platform owners / partners / admins). This is
// separate from the renter login: it marks the navigation as an ACTIVE login
// flow (b2_auth_intent) and opens the auth-only /owner-login page, which
// anonymous visitors cannot reach without that marker.
export const startOwnerLogin = () => {
  persistAuthIntent();
  window.location.href = "/owner-login";
};
