# ALTUSplace 🏠🚗

A Moroccan platform for car rental and real estate rental, connecting renters and partners with a commission system and secure booking.

## ✨ Features
- 🔍 Dual search (cars + properties) with advanced filters
- 👥 Three dashboards: renter, partner, super admin
- 📅 Full booking system with availability calendar
- 💳 Online payment (CMI) + partner wallet
- 🗺️ Interactive maps (Leaflet + Mapbox)
- 💬 Built-in chat system
- 🌍 Multi-language support (Arabic / French) with RTL
- 🔐 KYC verification for partners
- ⚖️ Dispute management system

## 🛠️ Tech Stack
- **Frontend:** React 19, Vite 7, TypeScript 5.9, Tailwind CSS 4, Radix UI, TanStack Query, tRPC
- **Backend:** Express 4, Drizzle ORM, Zod
- **Database:** PostgreSQL (Supabase) + Upstash Redis
- **Services:** AWS S3, AWS Translate, Mapbox
- **Testing:** Vitest, Playwright

## 🚀 Local Setup
### Requirements
- Node.js 20+
- pnpm
- Supabase account
- Upstash Redis account

### Steps
```bash
git clone https://github.com/ALTUSplace/ALTUSplace.git
cd ALTUSplace
pnpm install
cp .env.example .env
# edit values in .env
pnpm drizzle-kit push
pnpm dev
```