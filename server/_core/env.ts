export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Identity verification provider: "manual" (secure upload + admin review),
  // "stripe_identity", or "persona". See server/verification/provider.ts.
  verificationProvider: process.env.VERIFICATION_PROVIDER ?? "manual",
  verificationWebhookSecret: process.env.VERIFICATION_WEBHOOK_SECRET ?? "",
  stripeIdentitySecretKey: process.env.STRIPE_IDENTITY_SECRET_KEY ?? "",
  stripeIdentityWebhookSecret: process.env.STRIPE_IDENTITY_WEBHOOK_SECRET ?? "",
  personaApiKey: process.env.PERSONA_API_KEY ?? "",
  personaWebhookSecret: process.env.PERSONA_WEBHOOK_SECRET ?? "",
  // Stripe Connect split payments (multi-vendor escrow & payouts)
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  // Redis cache configuration (Upstash Redis)
  redisUrl: process.env.UPSTASH_REDIS_REST_URL ?? "",
  redisToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
  redisEnabled: process.env.REDIS_ENABLED !== "false",
  // Translation service configuration
  translationProvider: (process.env.TRANSLATION_PROVIDER as "aws" | "google" | "deepl" | "none") ?? "aws",
  awsRegion: process.env.AWS_REGION ?? "us-east-1",
  awsTranslateAccessKeyId: process.env.AWS_TRANSLATE_ACCESS_KEY_ID ?? "",
  awsTranslateSecretAccessKey: process.env.AWS_TRANSLATE_SECRET_ACCESS_KEY ?? "",
  googleTranslateApiKey: process.env.GOOGLE_TRANSLATE_API_KEY ?? "",
  deeplApiKey: process.env.DEEPL_API_KEY ?? "",
  translationEnabled: process.env.TRANSLATION_ENABLED !== "false",
};
