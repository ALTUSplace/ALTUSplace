ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'stripe_card';--> statement-breakpoint
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'paypal';