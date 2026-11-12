# KADAI – Shop in a Chat

KADAI is an AI-powered small-business e-commerce platform. Sellers can create product listings using photos and AI, while customers can discover products, ask questions through an AI shopping assistant, and pay using PayPal Sandbox.

## Features

- **AI Product Listing:** Upload a product photo and provide a short note to generate a product name, description, suggested price, and details.
- **AI Shopping Assistant:** Customers can ask questions about products using the available product information.
- **AI Provider Fallback:** Gemini is the primary AI provider. Groq is used as a fallback when Gemini fails.
- **Product Management:** Sellers can create and publish product listings.
- **PayPal Sandbox Payments:** Supports the order creation, approval, and capture payment flow.
- **Split Payments:** Supports split-payment functionality when enabled.
- **Order Management:** Provides order-related API functionality.

## Tech Stack

| Component | Technology |
|---|---|
| Frontend and Backend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS |
| AI | Vercel AI SDK, Google Gemini, Groq |
| Database and Storage | Supabase |
| Validation | Zod |
| Payments | PayPal Sandbox |
| Deployment | Render |

## AI Usage

KADAI uses AI for three jobs:

1. **Listing writer:** the seller uploads a product photo (plus an optional note). Gemini looks at the photo and writes the name, description, a suggested price and key details. The seller can edit everything before publishing.
2. **Shop assistant:** buyers chat with an AI assistant that answers only from the product's details, never changes the price, and offers a "Confirm & pay" button when the buyer wants to buy.
3. **Reminder writer (split payments):** writes a friendly WhatsApp-style reminder that names only the friends who still need to pay, with the tracker link.

**Fallback:** Gemini Flash is tried first. If it fails, text jobs (chat and reminders) retry with Groq. Groq can't read photos, so if the listing step fails, the seller fills the form by hand (the photo is still saved).

The AI listing endpoint validates image size, MIME type, and file signature. Supported formats are JPG, PNG, and WEBP. Maximum image size is 4 MB.

## PayPal Integration

KADAI uses PayPal Sandbox for test payments.

The payment flow is:

1. Create an order.
2. Redirect the buyer for PayPal approval.
3. Return to the application.
4. Capture the approved payment.

Use PayPal Sandbox credentials only during development and testing.

## Split Payments

Split-payment functionality is controlled using the `SPLIT_ENABLED` environment variable.

- `false` – Split payments disabled.
- `true` – Split payments enabled.

The split-payment API supports creating and retrieving split-payment information and processing shares.

## Project Structure

```text
kadai/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── ai/
│   │   │   ├── checkout/
│   │   │   ├── orders/
│   │   │   ├── pay/
│   │   │   ├── products/
│   │   │   └── split/
│   │   ├── seller/
│   │   ├── shop/
│   │   └── split/
│   └── lib/
│       ├── ai.ts
│       ├── chat-prompt.ts
│       ├── prompts.ts
│       └── supabase.ts
├── scripts/
├── public/
├── .env.example
├── package.json
└── README.md
```

## Requirements

- Node.js and npm
- Supabase project
- PayPal Developer Sandbox account
- Google Gemini API key
- Groq API key

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/whitepixeltechnologiesofficial/kadai-copy.git
cd kadai-copy
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and add your own credentials.

```powershell
Copy-Item .env.example .env.local
```

Configure the following variables:

| Variable | Purpose |
|---|---|
| `PAYPAL_CLIENT_ID` | PayPal Sandbox client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal Sandbox client secret |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API key |
| `GEMINI_MODEL` | Gemini model identifier |
| `GROQ_API_KEY` | Groq API key |
| `GROQ_MODEL` | Groq model identifier |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key |
| `APP_BASE_URL` | Application base URL |
| `SHOP_NAME` | Shop display name |
| `SPLIT_ENABLED` | Enable or disable split payments |

Never commit `.env.local` or expose API keys and service-role credentials.

### 4. Configure Supabase

1. Create a Supabase project and copy the **Project URL** and **service_role key** into `.env.local`.
2. Go to **SQL Editor**, paste the SQL below and click **Run**.
3. Go to **Storage**, create a bucket named `product-images` and set it to **Public**.

```sql
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  price numeric(10,2) not null check (price > 0),
  image_url text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'published' check (status in ('draft','published')),
  created_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  buyer_name text,
  total numeric(10,2) not null,
  type text not null check (type in ('single','split')),
  status text not null default 'pending'
    check (status in ('pending','paid','partially_paid','fully_paid')),
  paypal_order_id text unique,
  created_at timestamptz not null default now()
);

create table split_shares (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  participant_name text not null,
  amount numeric(10,2) not null,
  paypal_order_id text unique,
  status text not null default 'pending' check (status in ('pending','paid')),
  paid_at timestamptz
);

alter table products enable row level security;
alter table orders enable row level security;
alter table split_shares enable row level security;
```

Row level security is on with no rules, so the browser can't read or write the tables directly. Only the server can, using the service role key.

### 5. Start the development server

```bash
npm run dev
```

Open:

http://localhost:3000

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |

## PayPal Sandbox Testing

1. Create or sign in to a PayPal Developer account.
2. Create Sandbox buyer and business accounts.
3. Configure the Sandbox client credentials.
4. Use a Sandbox Personal account to test buyer payments.
5. Verify order creation, approval, and capture.

> **Sandbox test login:** use any PayPal sandbox **Personal** account to pay. No real money is used.

No real money should be used during Sandbox testing.

## Known Limitations

- The application uses PayPal Sandbox for testing, not live payment processing.
- AI-generated product information must be reviewed by the seller before publishing.
- AI responses depend on the configured AI providers and their availability.
- Demo only: one shop, one seller, no login, USD only, no delivery or refunds.
- Split payments depend on the `SPLIT_ENABLED` setting.

## Deployment

The project is deployed using Render.

Production deployment requires the correct Git branch, environment variables, Supabase configuration, and PayPal Sandbox credentials.

## License

This project is licensed under the MIT License. See the repository's `LICENSE` file for details.
## Screenshots

Add the following screenshots after running the application locally:

1. **Shop Home Page** - `screenshots/shop-home.png`
2. **AI Product Listing** - `screenshots/ai-product-listing.png`
3. **AI Shopping Assistant** - `screenshots/ai-shopping-assistant.png`
4. **PayPal Checkout** - `screenshots/paypal-checkout.png`

