# ChronoRoam

ChronoRoam is a trip planner built around a day-by-day itinerary — each day can hold flights, lodging, restaurants, transportation, directions, car rentals, tours, activities, or anything else your trip needs. It comes with a shared to-do list and packing list too. ChronoRoam doesn't force one planning style: use it as a fully structured itinerary when you want that, or a loose framework you fill in as you go when you don't. Forward or paste a confirmation email and AI extracts the details automatically, and destination tips — visa/entry requirements, outlet types, weather, and local know-how — are generated for wherever you're headed.

## Features

- Day-by-day itinerary spanning the trip's date range, with live weather per day — three views: row (days stacked), column (days side by side) and calendar; each device remembers the last one used
- Structured itinerary items — flight, lodging, restaurant, transportation, direction, car rental, tour, activity — each with its own fields
- Flights and lodging create linked departure/arrival and check-in/check-out entries, which can land on different days
- Freeform to-do list and freeform day tasks alongside the structured items
- Swipe left to delete a task, long-press and drag to reorder
- Click a structured item for a read-only details view, with an Edit action
- Editable trip title and date range, with a live countdown to departure
- Real accounts (username/password, or a "continue as guest" path backed by a real unclaimed account) — trip/packlist access is membership-based, not just an unguessable link
- Forward or paste a flight/lodging/etc. confirmation email — one AI call classifies and extracts it, then you review, edit, and pick a trip before anything is saved
- Trip Tips panel: visa/entry status for US passport holders (grounded in a live web search), outlet/plug comparison, weather vs. home, and destination-specific practical advice
- Packing lists — reusable templates, linkable to trips, many-to-many
- Sharing: share a trip or packing list by link, QR code, or username invite (the invitee gets an Accept/Decline card on Home and an email); a shared icon marks anything more than one person can edit
- On a shared trip, each member has their own packing list links: link a list for everyone or only yourself, and unlinking, duplicating or swapping a list only changes your view; people who join later get the lists linked for everyone
- Packing list bags nest inside each other, each with a name and one of 104 colors; battery and power bank items get an automatic ⚠️ carry-on reminder
- Emoji shortcuts on to-do and packing list items (🍗 ☕ 🛍️ or ☀️ ❄️ ⏰, plus the last emoji you typed) — tapping one just adds that emoji to the start of the item's text, so it can be backspaced out like anything typed
- Small/Big text size setting for trip and packing list items
- Credits: trips, packing lists, weather and Trip Tips are free and unlimited; AI imports use credits — every user gets 50 free (guests get 3), and $5 adds 1,000 more — see "Credits / In-App Purchase" below

## How It Works

### Per-day location (for weather)

ChronoRoam works out where the traveler will be on each day of the trip, so each day shows the right city's forecast without the user setting anything. It's done in `my-frontend/src/utils/dayLocations.js` using rank-based signals from the itinerary:

- **Ranked signals, most to least trusted:** flight arrival airport > transportation or directions destination > hotel check-in > activity, restaurant, tour or car location.
- **Carry forward:** once you've arrived somewhere, later days stay there until another signal moves you.
- **Late-arrival cutoff:** an arrival late in the day only takes over from the next day, since most of that day was spent where you started.
- **Round-trip base detection:** matching first-departure and last-arrival airports identify the traveler's home base.
- **Outlier rejection:** low-confidence geocoder matches (for example, a neighborhood name that resolves to a same-named town in another region) are dropped if they land more than 500 km (haversine distance) from every higher-ranked signal.
- **Fallbacks, in order:** days with no signal carry forward the previous day's location. Days before the first signal use the first departure airport, then the trip's Destinations field, then a place name found in the trip title; if nothing resolves, no weather is shown rather than a guess. Titles are matched against an offline set of ~250 countries and 1,500 major cities before a single geocoding call, so a title like "Mom's 60th Birthday Weekend" costs no network requests.

### Forecast vs. typical weather

Each day's weather is a real forecast from Open-Meteo when the date is inside its ~16-day forecast window. Further out, the app shows the 3-year average for that calendar day at the resolved location, from a shared server-side cache (`my-backend/utils/weatherHistory.js`, also used by Trip Tips), labeled in the UI as typical weather rather than a forecast. It switches to the real forecast automatically as the date gets closer.

### Shared, cache-first lookups

Every external lookup is cache-first and shared across users: it checks a shared PostgreSQL cache and only calls the AI model or outside API on a miss, so each answer is fetched once and reused. Costs go down per user as usage grows, including paid AI calls for Trip Tips and the GPT flight-lookup fallback. (AI email import is the exception: every email is different, so each import is its own AI call, capped per user by the import quota.)

- **Trip Tips** (`cached_trip_tips`): keyed by destination (and passport country, currently always US), re-verified every 75 days.
- **Weather history** (`weather_history_cache`): keyed by coordinates rounded to one decimal place (~11 km), since weather doesn't vary meaningfully at finer resolution, which raises the hit rate across nearby places.
- **Geocoding** (`geocode_cache`): place names rarely change; a genuine "no result" is cached too, while a failed request is not.
- **Flights** (`cached_flights`): scheduled data only, shared by flight number. Lookups fall back from AeroDataBox to AviationStack to GPT with web search, and `api_usage` tracks each provider's monthly quota; cache hits never count against it.
- **Destination-key reuse** (`utils/aiDestinationResolver.js`): before the expensive, search-grounded Trip Tips call, a low-cost model (gpt-4.1-nano, about $0.000007 per call) identifies the destination a title names, so differently worded titles like "Tokyo Trip" and "Tokyo 2026" reuse one cached answer.
- **One weather cache, several features:** per-day weather, the Trip Tips weather-vs-home comparison and multi-destination weather all read the same per-day cache, so overlapping dates cost nothing extra.
- **Static where possible:** outlet types by country and airport coordinates are bundled data, not API or AI calls.

### Drag and drop

Reordering is a custom pointer-event implementation rather than a drag library:

- Long-press to start a drag; rows are moved directly with CSS transforms for smooth motion.
- A shared drop-preview line (`utils/dropLine.js`) shows where the item will land.
- An auto-scroll loop (`utils/dragAutoScroll.js`) keeps scrolling while the pointer rests near a container's edge, in whichever scrollable list the drag started.
- Background polling pauses during a drag (`utils/reorderGuard.js`) so a refetch can't re-render the list mid-gesture; the guard self-expires if a drag is interrupted.

## Tech Stack

**Frontend:** React, react-router, Capacitor (iOS), Open-Meteo (weather)
**Backend:** Node.js, Express, PostgreSQL (raw SQL via `pg`)
**AI:** Anthropic Claude (Haiku) and OpenAI (`gpt-4.1-nano`, cheap-model-first with a reliability fallback to Haiku) for import extraction and trip tips

## Getting Started

### Prerequisites

- Node.js and npm
- PostgreSQL
- A `.env` file in `my-backend/` and `my-frontend/` (see below)

### 1. Set up the database

```bash
createdb chronoroam
psql chronoroam -f my-backend/schema.sql
```

### 2. Configure environment variables

`my-backend/.env`:
```
PORT=5000
PGUSER=your_pg_user
PGPASSWORD=your_pg_password
PGHOST=localhost
PGPORT=5432
PGDATABASE=chronoroam
JWT_SECRET=some_random_secret

# AI features (optional — each degrades gracefully to "unavailable" without its key, per the
# lazy-env-var-presence convention used throughout my-backend/utils/)
ANTHROPIC_API_KEY=            # Trip Tips, and the reliability fallback for import extraction
OPENAI_API_KEY=               # Cheap-model (gpt-4.1-nano) import extraction — see AI_EXTRACTION_PROVIDER
AI_EXTRACTION_PROVIDER=openai # or "anthropic" to skip the cheap tier entirely

# Cached flight-schedule lookups (optional, same graceful-degrade convention)
AVIATIONSTACK_API_KEY=
RAPIDAPI_KEY=                 # AeroDataBox, via RapidAPI

# Forwarded-email intake (see my-backend/routes/webhookRoutes.js + email-worker/) — shared
# secret the Cloudflare Email Worker sends back to prove a request is really from it
EMAIL_INTAKE_SHARED_SECRET=

# Password-reset emails
GMAIL_USER=
GMAIL_APP_PASSWORD=
FRONTEND_URL=http://localhost:3000

# Web purchase (optional — see "Monetization / In-App Purchase" below; without these, checkout
# throws a clear "not configured yet" error rather than failing at module load)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

`my-frontend/.env`:
```
REACT_APP_BASE_URL=http://localhost:5000

# Feature flags — both default OFF; gitignored, so each new machine needs these set by hand or
# the corresponding feature silently doesn't appear in the UI at all
REACT_APP_ENABLE_AI_FLIGHT_EXTRACTION=true  # "Paste confirmation email" entry point (AddItemModal)
REACT_APP_ENABLE_EMAIL_IMPORT=true          # Forwarded-email review queue (needs the backend's
                                             # EMAIL_INTAKE_SHARED_SECRET set too — see below)
```

### 3. Run the backend

```bash
cd my-backend
npm install
npm start
```

### 4. Run the frontend

```bash
cd my-frontend
npm install
npm start
```

Open `http://localhost:3000` — sign up, or continue as a guest, and create a trip.

## Credits / In-App Purchase

Trips, packing lists, per-day weather and Trip Tips are free and unlimited. AI imports use credits: each user gets a lifetime allowance of free credits, and a $5 purchase adds more. There are no plans or subscriptions, and buying credits doesn't make a different kind of account — it only adds to the balance. (`users.purchase_platform` records that an account has bought credits, for labeling the Stripe checkout; nothing else depends on it.)

- **AI imports** (forwarded-email and pasted-email extraction, plus AI packing-list import) are the only metered feature, since each one is a paid AI call. There are two kinds of account, guest and user. Guests get 3 credits; signing up clears the guest's usage, so every user starts with 50 free credits for the life of the account, and the allowance never renews (see `my-backend/utils/importQuota.js`). A $5 purchase adds 1,000 credits to a running balance, with no cap on repeat purchases; free credits are spent first, and running out just means buying more (see `PURCHASE_CREDIT_GRANT`/`PURCHASE_PRICE_CENTS` in `my-backend/utils/creditGrants.js`).
- **Trips/packing lists** are unlimited for users; guests are limited to 1 each until they sign up. An old per-user cap of 3 is still in `my-backend/utils/resourceQuota.js`, switched off with `USER_CAPS_ENABLED`.
- **Feature locks** (Weather and Trip Tips' extra sections) and a purchaser crown icon are switched off in `my-frontend/src/utils/creditLocks.js`, kept so they can be turned back on later.
- **Abuse resistance**: deleting an account and re-registering (or a guest clearing local storage) would otherwise grant the free credits again. `spent_trials` records a one-way keyed hash (HMAC-SHA256) of the email and device ID (native iOS only, via `@capacitor/device`) at delete time, never the values themselves, along with how many credits the account had left. Signing up again with that email always goes through a verification link, then gives back exactly those leftover credits once and no new free ones; a guest on a recorded device gets no guest credits. See `my-backend/models/SpentTrial.js` and `User._restoreCredits`.

Two ways to buy credits, both adding to the running `import_credits` balance (and setting `users.purchase_platform`):

- **Web** (chronoroam.app): Stripe checkout, embedded (Stripe's payment form renders inside `PurchaseModal.js` via `<EmbeddedCheckout>`, not a redirect to a separate checkout.stripe.com page) — see `my-backend/routes/billingRoutes.js`'s `/stripe/checkout` and `my-backend/routes/stripeWebhook.js`. Credits are only added once Stripe's webhook confirms the payment, never from the client directly. Needs a real Stripe account and `STRIPE_SECRET_KEY`/webhook secret configured — the routes throw a clear "not configured yet" error without it, same lazy-env-var-presence convention as the AI keys further up.
- **iOS**: Apple In-App Purchase (StoreKit 2), via the `@capgo/native-purchases` Capacitor plugin (free/open-source, no license needed — not to be confused with some other Capacitor purchase plugins that require a paid registry key). Requires:
  - An Apple Developer Program membership ($99/yr)
  - An app record in App Store Connect, with a Consumable In-App Purchase product created (product ID `com.solnguyen.chronoroam.1000`, "1000 imports," as configured in `my-backend/utils/appleReceiptVerification.js` — used for both the first purchase and any later top-off, since credits draw down over time; an earlier separate Non-Consumable "unlock" product has been removed from App Store Connect)
  - Server-side verification via Apple's official `@apple/app-store-server-library` — verifies the signed transaction the app receives after a purchase against Apple's public root certificate (bundled in `my-backend/certs/`, not a secret) before ever trusting a client-reported purchase. No Apple API key/issuer ID is needed for this specific piece — that's only required for calling Apple's server API proactively (subscription status polling, etc.), which this app doesn't do.
