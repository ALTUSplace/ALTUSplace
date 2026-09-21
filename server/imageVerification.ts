import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";

export const ORIGINAL_IMAGE_REJECTION_MESSAGE =
  "عذراً، ينبغي إرفاق صور أصلية وواقعية من تصويركم المباشر لضمان الشفافية ومصداقية العرض على المنصة.";

export type ImageVerificationResult = {
  accepted: boolean;
  confidence: number;
  reasons: string[];
};

type ImageProofPayload = {
  ownerId: number;
  url: string;
  sha256: string;
  issuedAt: number;
};

function proofSignature(payload: string) {
  if (!ENV.cookieSecret) throw new Error("Image verification signing secret is not configured");
  return createHmac("sha256", ENV.cookieSecret).update(payload).digest("base64url");
}

export function createImageVerificationProof(input: { ownerId: number; url: string; bytes: Uint8Array }) {
  const payload: ImageProofPayload = {
    ownerId: input.ownerId,
    url: input.url,
    sha256: createHash("sha256").update(input.bytes).digest("hex"),
    issuedAt: Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${proofSignature(encoded)}`;
}

export function verifyImageVerificationProof(input: { proof: string; ownerId: number; url: string; bytes?: Uint8Array }) {
  try {
    const [encoded, signature] = input.proof.split(".");
    if (!encoded || !signature) return false;
    const expected = proofSignature(encoded);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return false;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ImageProofPayload;
    if (payload.ownerId !== input.ownerId || payload.url !== input.url) return false;
    if (!Number.isFinite(payload.issuedAt) || Date.now() - payload.issuedAt > 24 * 60 * 60 * 1000) return false;
    if (input.bytes && createHash("sha256").update(input.bytes).digest("hex") !== payload.sha256) return false;
    return true;
  } catch {
    return false;
  }
}

const verificationSchema = {
  name: "original_image_verification",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      isRealistic: { type: "boolean" },
      isPromotional: { type: "boolean" },
      isStockLike: { type: "boolean" },
      isAiGenerated: { type: "boolean" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reasons: { type: "array", items: { type: "string" }, maxItems: 5 },
    },
    required: ["isRealistic", "isPromotional", "isStockLike", "isAiGenerated", "confidence", "reasons"],
  },
  strict: true,
} as const;

function readAssistantJson(result: Awaited<ReturnType<typeof invokeLLM>>) {
  const content = result.choices[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Vision AI returned no text result");
  return JSON.parse(content) as {
    isRealistic: boolean;
    isPromotional: boolean;
    isStockLike: boolean;
    isAiGenerated: boolean;
    confidence: number;
    reasons: string[];
  };
}

export async function verifyOriginalListingImage(input: {
  base64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}): Promise<ImageVerificationResult> {
  if (!ENV.forgeApiKey) {
    // No AI verification backend configured (BUILT_IN_FORGE_API_KEY missing).
    // Fall back to manual acceptance so listing creation/updates keep working;
    // the HMAC proof is still issued per-owner/per-image and validated on create/update.
    return { accepted: true, confidence: 0, reasons: ["manual"] };
  }
  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are a strict marketplace image authenticity screener. Assess only visible evidence. Accept only realistic, user-captured-looking photos of the listed asset. Reject stock-photo-like, promotional graphic, screenshots, collages, watermarks, heavy marketing edits, and AI-generated-looking images. You cannot prove provenance or capture source; use conservative decisions and explain uncertainty.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Classify this listing image. Return only the requested JSON schema. Set accepted only when it is realistic and none of the rejection flags apply with confidence at least 0.78.",
            },
            { type: "image_url", image_url: { url: `data:${input.mimeType};base64,${input.base64}`, detail: "high" } },
          ],
        },
      ],
      outputSchema: verificationSchema,
      maxTokens: 500,
    });

    const analysis = readAssistantJson(result);
    const confidence = Math.max(0, Math.min(1, Number(analysis.confidence)));
    const rejectedBySignal = !analysis.isRealistic || analysis.isPromotional || analysis.isStockLike || analysis.isAiGenerated;
    return {
      accepted: !rejectedBySignal && confidence >= 0.78,
      confidence,
      reasons: Array.isArray(analysis.reasons) ? analysis.reasons.slice(0, 5) : [],
    };
  } catch {
    return {
      accepted: false,
      confidence: 0,
      reasons: ["تعذر التحقق من أصلية الصورة حالياً. يرجى المحاولة بصورة واضحة وواقعية أخرى."],
    };
  }
}
