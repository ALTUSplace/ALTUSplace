# 🇲🇦 ALTUSplace

> Morocco's marketplace for car rentals, real estate, and office spaces.

[![Live Site](https://img.shields.io/badge/Live%20Site-altusplace.vercel.app-0A192F)](https://altusplace.vercel.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev)
[![License](https://img.shields.io/badge/License-MIT-D4AF37)](LICENSE)

## ✨ Features

- 🚗 Car rentals with KYC, insurance options, dynamic seasonal pricing
- 🏠 Real estate & office spaces with commercial lease contracts (PDF)
- 💳 Multi-gateway payments: CMI, Stripe Connect, PayPal, PayZone, PayTabs, Bank Transfer
- 🔄 iCal sync with Airbnb & Booking.com (hourly cron)
- 📱 WhatsApp Business API for instant agency alerts
- 🌐 Tri-lingual interface: Arabic (RTL), French, English
- 🔐 Role-based access: Renter / Partner / Admin / Super Admin
- ⚖️ Dispute resolution center with file attachments and mediation
- 📄 Auto-generated contracts & invoices (PDF with Arabic shaping + TVA)
- 🛡️ Row-Level Security via Supabase + Drizzle ORM

## 🏗️ Architecture

```
ALTUSplace/
├── client/        # Vite + React 19 + Tailwind 4 + tRPC
├── server/        # Express + tRPC v11 + Drizzle ORM
├── shared/        # Zod schemas shared client/server
├── drizzle/       # PostgreSQL migrations
├── supabase/      # RLS policies (rls.sql)
└── e2e/           # Playwright tests
```

## 🚀 Quick Start

```bash
git clone https://github.com/ALTUSplace/ALTUSplace.git
cd ALTUSplace
pnpm install
cp .env.production.example .env
# Fill: DATABASE_URL (Supabase), JWT_SECRET (>= 32 bytes)
pnpm db:migrate
pnpm dev
# Client: http://localhost:5173 | API: http://localhost:3000
```

## 🧪 Testing

```bash
pnpm test     # Vitest (35+ unit & integration tests)
pnpm check    # TypeScript strict mode
pnpm build    # Production build
```

## 📜 Legal

- Compliant with Moroccan Law 09-08 (CNDP data protection)
- Commercial lease contracts follow Moroccan legal framework
- Platform operates as technical intermediary only

## 📄 License

MIT © ALTUSplace

---
**Built with ❤️ in Morocco**