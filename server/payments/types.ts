// Shared payment types — used by server modules and mirrored client-side.

export type CheckoutCurrency = "MAD" | "EUR" | "USD";

export type TransactionGateway = "payzone" | "paytabs" | "cashplus" | "wafacash" | "arrival";
export type TransactionStatus = "pending" | "paid" | "failed" | "expired";

export type GatewayRedirect =
  | { kind: "redirect"; provider: TransactionGateway; url: string; externalReference: string }
  | { kind: "voucher"; provider: TransactionGateway; reference: string; expiresAt: Date | null }
  | null;
