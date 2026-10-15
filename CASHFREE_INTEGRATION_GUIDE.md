# LUXORA — Cashfree Payments Integration Guide

This guide documents the **Cashfree Payment Gateway** integration implemented for LUXORA Luxury Atelier.

---

## 1. Architecture Overview

```
Frontend (React 19 + Cashfree Web SDK v3)
    │
    ├── 1. POST /api/create-order  ─────────────► Cashfree PG API (/pg/orders)
    │   (Cart total, Customer, Currency INR)       (Generates payment_session_id)
    │
    ├── 2. Cashfree Modal Checkout ─────────────► Customer Bank / UPI / Cards
    │   (or Cashfree Sandbox Simulator)
    │
    ├── 3. POST /api/verify-payment ────────────► Verify Order Status & Payments
    │   (Idempotency, Lock, Capture)               (Records captured order)
    │
    └── 4. POST /api/webhook ───────────────────► Cashfree Webhook Signature Check
        (Asynchronous payment capture/failures)   (HMAC-SHA256 Base64 verification)
```

---

## 2. Environment Variables Configuration

Create or update `.env.local` (local secrets, automatically git-ignored) or `.env`:

```bash
# Environment Mode: 'sandbox' (Test) or 'production' (Live)
CASHFREE_ENV=sandbox

# Cashfree API Credentials (from Merchant Dashboard -> Developers -> API Keys)
CASHFREE_APP_ID=TEST1000xxxxxxxxx
CASHFREE_SECRET_KEY=cfsk_ma_test_xxxxxxxxxxxxxxxx

# API Version (Stable PG release)
CASHFREE_API_VERSION=2023-08-01

# Webhook Secret (Set up in Cashfree Dashboard -> Developers -> Webhooks)
CASHFREE_WEBHOOK_SECRET=your_cashfree_webhook_secret_here

# Frontend Vite Exposure
VITE_CASHFREE_ENV=sandbox
VITE_CASHFREE_APP_ID=TEST1000xxxxxxxxx

# Store Details
CASHFREE_CURRENCY=INR
CASHFREE_MERCHANT_NAME=LUXORA Luxury Atelier
```

---

## 3. How to Obtain Cashfree API Keys

1. Sign up or log in at **[Cashfree Merchant Portal](https://merchant.cashfree.com/)**.
2. Switch to **Sandbox Mode** in the header toggle to test transactions safely.
3. In the sidebar, navigate to **Payment Gateway** -> **Developers** -> **API Keys**.
4. Click **Generate API Keys**.
5. Copy your **App ID** (Client ID) and **Secret Key**.
6. Paste them into `.env.local`:
   ```bash
   CASHFREE_APP_ID=TEST...
   CASHFREE_SECRET_KEY=cfsk_ma_test_...
   ```
7. When ready to go live, complete your business KYC on Cashfree, switch to **Production**, and generate your Live API Keys.

---

## 4. Setting Up Webhooks

1. Go to **Cashfree Dashboard** -> **Developers** -> **Webhooks**.
2. Add an endpoint:
   - **URL**: `https://your-domain.vercel.app/api/webhook`
   - **Events**: Subscribe to `PAYMENT_SUCCESS_WEBHOOK`, `PAYMENT_FAILED_WEBHOOK`, `PAYMENT_USER_DROPPED_WEBHOOK`, `ORDER_PAID_WEBHOOK`.
3. Set your webhook secret in `CASHFREE_WEBHOOK_SECRET`.

---

## 5. High-Fidelity Sandbox Simulator

When `CASHFREE_APP_ID` has placeholder values or test mode is active without network credentials, LUXORA launches the **Cashfree Simulator Modal**:
- Authentic Cashfree branded modal with Purple & Teal accents and LUXORA Atelier styling.
- Interactive payment channel selection (UPI, Cards, NetBanking, Wallets).
- Instant **"Simulate Successful Payment"**, **"Simulate Bank Failure"**, and **"Cancel & Close"** actions.
- Automatically tests the full backend verification and order confirmation flow.
