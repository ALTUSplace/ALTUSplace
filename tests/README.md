# ALTUSplace - Automated Test Suite

This directory contains comprehensive automated tests for the ALTUSplace booking platform, covering security, business logic, and integration scenarios.

## Test Structure

```
tests/
├── unit/                          # Unit tests for pure business logic
│   ├── pricing.test.ts            # Invoice totals, VAT, commission calculations
│   ├── pricing-currency.test.ts   # Currency conversion, city tax rates, Stripe split
│   ├── voucher.test.ts            # Voucher code generation, message building
│   ├── double-booking.test.ts     # Date overlap detection, blocked range parsing
│   └── double-booking-availability.test.ts  # Availability checking, date range parsing
├── integration/                   # Integration tests for security & middleware
│   ├── webhook-security.test.ts   # HMAC-SHA256 webhook signature verification
│   ├── rate-limiter.test.ts       # Rate limiting middleware behavior
│   └── xss-sanitization.test.ts   # XSS input sanitization
└── README.md                      # This file
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run only unit tests
pnpm test -- tests/unit

# Run only integration tests
pnpm test -- tests/integration

# Run with coverage
pnpm test -- --coverage

# Run in watch mode during development
pnpm test -- --watch
```

## Test Coverage Areas

### Unit Tests (Pure Business Logic)
- **Pricing Calculator**: Invoice totals, VAT calculation, commission fees, currency conversion, city-specific tax rates, Stripe Connect split calculations
- **Voucher Generation**: Unique code generation, Google Maps URL building, renter/owner message templates
- **Double-Booking Prevention**: Date overlap detection, blocked range parsing, availability checking, date range validation

### Integration Tests (Security & Middleware)
- **Webhook Security**: HMAC-SHA256 signature verification (Stripe-style timestamped and plain hex), tamper detection
- **Rate Limiting**: Request throttling, IP-based tracking, health endpoint bypass, header setting
- **XSS Sanitization**: HTML entity escaping, nested object handling, array sanitization, prototype pollution resistance

## Adding New Tests

When adding new tests:
1. Place unit tests in `tests/unit/` for pure functions
2. Place integration tests in `tests/integration/` for middleware/security
3. Use descriptive test names that explain the expected behavior
4. Test both happy paths and edge cases (invalid inputs, boundary conditions)
5. Keep tests isolated and independent
