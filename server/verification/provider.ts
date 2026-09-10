/**
 * Identity verification provider abstraction.
 *
 * Three strategies:
 *  - `manual`          (default): secure file upload to S3 + human/queue review.
 *                       Sessions are tracked in `kyc_submissions` and the admin
 *                       `kyc.review` procedure resolves them.
 *  - `stripe_identity` : Stripe Identity verification sessions (server-side,
 *                       driver's-licence native capture). Webhooks are verified
 *                       with an HMAC secret before resolving submissions.
 *  - `persona`         : Persona inquiries created server-side; results arrive
 *                       via signed webhooks.
 *
 * External providers are only reachable when their API key is configured in the
 * environment; otherwise `createSession` fails loudly and the secure-upload
 * (`manual`) path remains the operational baseline.
 */

export type VerificationProviderName = "manual" | "stripe_identity" | "persona";
export type ProviderResolution = "verified" | "rejected" | "pending" | "not_found";

export type ProviderSessionInput = {
  userId: number;
  submissionId: number;
  documentType: string;
  internalKey: string; // storage key of the uploaded original (used as metadata / fallback)
};

export type ProviderSessionResult = {
  sessionId: string;
  /** Opaque payload forwarded to the client SDK (Stripe client secret / Persona client token). */
  clientPayload?: Record<string, string>;
};

export interface VerificationProvider {
  readonly name: VerificationProviderName;
  /** `false` when verification happens on the provider side (webhook resolves the session). */
  readonly tracked: boolean;
  createSession(input: ProviderSessionInput): Promise<ProviderSessionResult>;
  resolveStatus(sessionId: string): Promise<ProviderResolution>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`Identity verification provider "${provider}" is not configured (missing API key / env).`);
    this.name = "ProviderNotConfiguredError";
  }
}

/** Secure-upload baseline: rows are resolved by `kyc.review` / webhook, never by the provider itself. */
export class ManualReviewProvider implements VerificationProvider {
  readonly name = "manual" as const;
  readonly tracked = true;
  async createSession(): Promise<ProviderSessionResult> {
    throw new Error("The manual provider does not create external sessions; use kyc.submit.");
  }
  async resolveStatus(): Promise<ProviderResolution> {
    throw new Error("The manual provider has no external sessions to resolve.");
  }
}

type PersonaInquiry = {
  data?: { id?: string; attributes?: { status?: "approved" | "declined" | "waiting" | "expired" } };
};

export class PersonaProvider implements VerificationProvider {
  readonly name = "persona" as const;
  readonly tracked = false;

  constructor(private readonly apiKey: string) {}

  private apiUrl() {
    return "https://api.withpersona.com/v1";
  }

  async createSession(input: ProviderSessionInput): Promise<ProviderSessionResult> {
    const res = await fetch(`${this.apiUrl()}/inquiries`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          attributes: {
            metadata: {
              user_id: String(input.userId),
              submission_id: String(input.submissionId),
              document_type: input.documentType,
            },
          },
        },
      }),
    });
    const json: PersonaInquiry = await res.json().catch(() => ({}));
    if (!res.ok || !json.data?.id) throw new Error(`Persona error ${res.status}: ${JSON.stringify(json)}`);
    return { sessionId: json.data.id };
  }

  async resolveStatus(sessionId: string): Promise<ProviderResolution> {
    const res = await fetch(`${this.apiUrl()}/inquiries/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    const json: PersonaInquiry = await res.json().catch(() => ({}));
    const status = json.data?.attributes?.status;
    if (status === "approved") return "verified";
    if (status === "waiting") return "pending";
    if (status === "declined" || status === "expired") return "rejected";
    return "not_found";
  }
}

// ---------------------------------------------------------------------------
// Registry & runtime resolution
// ---------------------------------------------------------------------------

const PROVIDER_SECRETS: { stripeIdentitySecretKey: string; personaApiKey: string } = {
  stripeIdentitySecretKey: "",
  personaApiKey: "",
};

/** Injected by the app entry point from `ENV` without creating an import cycle. */
export function configureProviderSecrets(secrets: { stripeIdentitySecretKey?: string; personaApiKey?: string }) {
  if (secrets.stripeIdentitySecretKey !== undefined) PROVIDER_SECRETS.stripeIdentitySecretKey = secrets.stripeIdentitySecretKey;
  if (secrets.personaApiKey !== undefined) PROVIDER_SECRETS.personaApiKey = secrets.personaApiKey;
}

let cachedProvider: VerificationProvider | null = null;

/** Test hook: pin the provider returned by `getVerificationProvider`. */
export function setVerificationProvider(provider: VerificationProvider) {
  cachedProvider = provider;
}

function buildProvider(name: VerificationProviderName): VerificationProvider {
  if (name === "stripe_identity") {
    if (!PROVIDER_SECRETS.stripeIdentitySecretKey) throw new ProviderNotConfiguredError(name);
    return new StripeIdentityProvider(PROVIDER_SECRETS.stripeIdentitySecretKey);
  }
  if (name === "persona") {
    if (!PROVIDER_SECRETS.personaApiKey) throw new ProviderNotConfiguredError(name);
    return new PersonaProvider(PROVIDER_SECRETS.personaApiKey);
  }
  return new ManualReviewProvider();
}

/** Resolves the runtime provider from `VERIFICATION_PROVIDER` (defaults to "manual"). */
export function getVerificationProvider(name: string | null | undefined = undefined): VerificationProvider {
  const resolved = name ?? process.env.VERIFICATION_PROVIDER ?? "manual";
  if (resolved !== "manual" && resolved !== "stripe_identity" && resolved !== "persona") {
    throw new ProviderNotConfiguredError(resolved);
  }
  if (cachedProvider === null || cachedProvider.name !== resolved) {
    cachedProvider = buildProvider(resolved);
  }
  return cachedProvider;
}

type StripeVerificationSession = {
  id?: string;
  client_secret?: string;
  status?: "processing" | "verified" | "unverified" | "requires_input" | "canceled";
};

export class StripeIdentityProvider implements VerificationProvider {
  readonly name = "stripe_identity" as const;
  readonly tracked = false;

  constructor(private readonly secretKey: string) {}

  private apiUrl() {
    return "https://api.stripe.com/v1";
  }

  private async request(path: string, formData?: Record<string, string>): Promise<unknown> {
    const res = await fetch(`${this.apiUrl()}${path}`, {
      method: formData ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData ? new URLSearchParams(formData) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Stripe Identity error ${res.status}: ${JSON.stringify(json)}`);
    return json;
  }

  async createSession(input: ProviderSessionInput): Promise<ProviderSessionResult> {
    const json = (await this.request("/identity/verification_sessions", {
      type: "document",
      "metadata[user_id]": String(input.userId),
      "metadata[submission_id]": String(input.submissionId),
      "metadata[document_type]": input.documentType,
    })) as StripeVerificationSession;
    if (!json.id) throw new Error("Stripe Identity returned no session id");
    return {
      sessionId: json.id,
      clientPayload: json.client_secret ? { clientSecret: json.client_secret } : undefined,
    };
  }

  async resolveStatus(sessionId: string): Promise<ProviderResolution> {
    const json = (await this.request(`/identity/verification_sessions/${encodeURIComponent(sessionId)}`)) as StripeVerificationSession;
    if (json.status === "verified") return "verified";
    if (json.status === "processing" || json.status === "requires_input") return "pending";
    return "rejected";
  }
}