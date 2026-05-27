# ◊·κ=1 · FallCore Factory

**The factory that mints branded FallCore deployments on demand.**

Customer describes their company in a 60-second wizard. Factory allocates a unique prime, signs a 30-day Konomi trial licence, templates every file with their branding, and returns a complete `docker-compose` stack as a ZIP. They unzip, `docker compose up -d`, point their apps at it. Their on-prem brain is live.

Part of the [Fall* estate](https://github.com/sjgant80-hub). Pairs with [FallCore](https://github.com/sjgant80-hub/fallcore) — the product this factory mints.

---

## What it does

The flow:

```
Customer → wizard (5 steps) → POST /v1/forge/fallcore → ZIP download
                                                          │
                              ┌───────────────────────────┴───────────────────┐
                              │                                                │
                  per-customer ZIP contains:                                    │
                              │                                                │
   docker-compose.yml ←─ tier preset (lite/pro/sovereign/enterprise)            │
   proxy/server.js    ←─ company name + identity embedded                       │
   public/index.html  ←─ branded internal landing                              │
   .env.example       ←─ pre-filled with their model choice                    │
   konomi-licence.json ←─ Ed25519-signed 30-day trial                           │
   STACK_MANIFEST.json ←─ what was forged, when, projected ROI                  │
   INSTALL.md         ←─ branded quickstart                                    │
                              │
                  customer runs `docker compose up` → cognitive stack live
```

---

## Endpoints

```
POST /v1/forge/fallcore  → ZIP download
GET  /v1/tiers           → { lite, pro, sovereign, enterprise } catalog
GET  /v1/verticals       → 12 vertical presets
GET  /v1/stats           → forges built · by tier · by vertical
GET  /health             → status
```

### POST /v1/forge/fallcore

Body:
```json
{
  "company": "Acme Logistics",
  "short": "Acme",
  "email": "ops@acme.example",
  "tier": "pro",
  "vertical": "manufacturing",
  "brand_primary": "#0066cc",
  "brand_accent": "#d4af37",
  "brand_bg": "#0a0c10",
  "frontier_spend_gbp": 85000
}
```

Returns `application/zip` with `Content-Disposition: attachment; filename="acme-logistics-fallcore.zip"`.

Response headers:
- `x-fallcore-forge-id` — unique forge ID (quote this for support)
- `x-fallcore-prime` — the prime allocated to this customer's stack

---

## Tiers

| Tier | £/mo | Setup | Model | VRAM | Frontier savings |
|---|---:|---:|---|---|---:|
| Lite | 297 | 0 | llama3.1:8b | 8GB | ~40% |
| Pro | 997 | 5,000 | qwen2.5:32b | 24GB | ~75% |
| Sovereign | 1,997 | 25,000 | qwen2.5:72b | 48GB | ~95% |
| Enterprise | 4,997 | bespoke | qwen2.5:72b | 48GB+ | ~99% |

---

## Verticals (12 presets)

Legal · Procurement · Healthcare · Finance · Fitness · Education · Manufacturing · Real Estate · Hospitality · Agency · NGO · Other

Each preset pre-configures compliance posture, recommended Fall* tools, and default RAG sources.

---

## Run the factory locally

```bash
git clone https://github.com/sjgant80-hub/fallcore-factory
cd fallcore-factory
npm install
export KONOMI_PRIVATE_KEY=...   # 32-byte base64 (without this, ZIPs ship without a signed trial)
node forge/server.js
# → factory live at http://localhost:3000
# → wizard at http://localhost:3000/
# → POST /v1/forge/fallcore returns ZIP
```

---

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | Factory listens here |
| `KONOMI_PRIVATE_KEY` | (empty) | 32-byte base64 ed25519 seed for licence signing. Without it ZIPs ship without trial. |

---

## How templating works

The factory reads `templates/` and applies these substitutions to every text file:

| Placeholder | Replaced with |
|---|---|
| `__COMPANY__` | "Acme Logistics" |
| `__COMPANY_SLUG__` | "acme-logistics" |
| `__COMPANY_SHORT__` | "Acme" |
| `__VERTICAL__` | "Manufacturing" |
| `__TIER__` | "Pro" |
| `__MODEL__` | "qwen2.5:32b" |
| `__VRAM__` | "24GB" |
| `__SAVINGS__` | "~75%" |
| `__MONTHLY__` | 997 |
| `__SETUP__` | 5000 |
| `__PRIME__` | 211 |
| `__BRAND_PRIMARY__` | "#0066cc" |
| `__BRAND_ACCENT__` | "#d4af37" |
| `__COMPLIANCE__` | "ISO 9001, ISA-95" |
| `__TOOLS__` | "FallCube · FallSignal · Trilogy stack" |
| `__BUILT_AT__` | "2026-05-27T14:23:00.000Z" |
| `__FORGE_ID__` | "fc_a1b2c3d4e5f6" |
| `__TRIAL_LICENCE_B64__` | (Ed25519-signed trial envelope) |

---

## Licence

MIT.

---

◊·κ=1
