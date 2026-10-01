-- ChronoRoam's database layout. Running this file creates a fresh, empty database (it deletes
-- the tables first). Changes to an existing database are made by utils/migrations.js.

-- Delete the old tables, dependents first.
DROP TABLE IF EXISTS trip_members;
DROP TABLE IF EXISTS packlist_members;
DROP TABLE IF EXISTS invites;
DROP TABLE IF EXISTS trip_packlists;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS todos;
DROP TABLE IF EXISTS trips;
DROP TABLE IF EXISTS packlist_items;
DROP TABLE IF EXISTS packlist_bags;
DROP TABLE IF EXISTS packlists;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS cached_flights;
DROP TABLE IF EXISTS cached_trip_tips;
DROP TABLE IF EXISTS api_usage;
DROP TABLE IF EXISTS weather_history_cache;
DROP TABLE IF EXISTS geocode_cache;
DROP TABLE IF EXISTS pending_email_imports;
DROP TABLE IF EXISTS ai_import_usage;
DROP TABLE IF EXISTS spent_trials;
DROP TABLE IF EXISTS apple_purchases;
DROP TABLE IF EXISTS stripe_purchases;

-- Packing lists. forked_from and forked_for_trip_id are old columns no longer used.
CREATE TABLE packlists (
    id SERIAL PRIMARY KEY,
    public_id VARCHAR(32) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL DEFAULT 'Packlist',
    forked_from INTEGER REFERENCES packlists(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Bags in a packing list, with a name and color. A bag can be inside another bag (parent_bag_id);
-- deleting a bag deletes what's inside it.
CREATE TABLE packlist_bags (
    id SERIAL PRIMARY KEY,
    packlist_id INTEGER NOT NULL REFERENCES packlists(id) ON DELETE CASCADE,
    parent_bag_id INTEGER REFERENCES packlist_bags(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL DEFAULT 'Bag',
    color VARCHAR(20) NOT NULL DEFAULT '#24425f',
    position INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Items in a packing list, in a bag (bag_id) or at the top (bag_id null). is_hot, is_cold and
-- is_last_min are the old tags; the app now puts those emoji in the text instead.
CREATE TABLE packlist_items (
    id SERIAL PRIMARY KEY,
    packlist_id INTEGER NOT NULL REFERENCES packlists(id) ON DELETE CASCADE,
    bag_id INTEGER REFERENCES packlist_bags(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    is_hot BOOLEAN NOT NULL DEFAULT FALSE,
    is_cold BOOLEAN NOT NULL DEFAULT FALSE,
    is_last_min BOOLEAN NOT NULL DEFAULT FALSE,
    position INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Trips. day_titles maps a date to that day's name. destinations are place names the user typed
-- (Trip Tips uses them first; the app fills them from the day plan the first time a trip with none
-- is opened). todo_title is the to-do list's name (null = "To-Do").
CREATE TABLE trips (
    id SERIAL PRIMARY KEY,
    public_id VARCHAR(32) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL DEFAULT 'Tokyo Trip',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    day_titles JSONB NOT NULL DEFAULT '{}',
    destinations TEXT[] NOT NULL DEFAULT '{}',
    todo_title VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Old column (see packlists), added here because it references trips, which is created after packlists.
ALTER TABLE packlists ADD COLUMN forked_for_trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL;

-- A trip's to-do list items. tags holds the old food/cafe/shopping tags.
CREATE TABLE todos (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    tags JSONB NOT NULL DEFAULT '{}'::jsonb,
    position INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- A trip's day-by-day items. cat is the category (flight, lodging, ... or null for a plain item),
-- with its details in fields. The two halves of a pair (like a flight's departure and arrival)
-- share a link_id. tags holds the old food/cafe/shopping tags.
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_date DATE NOT NULL,
    text TEXT NOT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    fixed BOOLEAN NOT NULL DEFAULT FALSE,
    flight BOOLEAN NOT NULL DEFAULT FALSE,
    cat VARCHAR(30),
    fields JSONB NOT NULL DEFAULT '{}',
    tags JSONB NOT NULL DEFAULT '{}'::jsonb,
    link TEXT,
    link_id VARCHAR(64),
    position INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for looking items up by trip, day, packing list and bag.
CREATE INDEX idx_todos_trip_id ON todos(trip_id);
CREATE INDEX idx_tasks_trip_id_day_date ON tasks(trip_id, day_date);
CREATE INDEX idx_packlist_items_packlist_id ON packlist_items(packlist_id);
CREATE INDEX idx_packlist_bags_packlist_id ON packlist_bags(packlist_id);
CREATE INDEX idx_packlist_bags_parent_bag_id ON packlist_bags(parent_bag_id);
CREATE INDEX idx_packlist_items_bag_id ON packlist_items(bag_id);

-- Accounts. A guest has no username, email or password until they sign up.
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    -- Shown as typed, but unique and signed in with ignoring case (idx_users_username_lower below).
    username VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    password VARCHAR(100),
    reset_token VARCHAR(100),
    reset_token_expires TIMESTAMP,
    temp_unit CHAR(1) NOT NULL DEFAULT 'F' CHECK (temp_unit IN ('F', 'C')),
    -- True until the user picks °F/°C themselves; while true, saving a home location sets temp_unit
    -- from it (utils/tempUnit.js).
    temp_unit_auto BOOLEAN NOT NULL DEFAULT TRUE,
    -- Home location, free text like "Seattle, WA". Used for plug and weather comparisons.
    location VARCHAR(100),
    -- No longer shown in the app; Trip Tips always uses United States (routes/aiRoutes.js).
    passport_country VARCHAR(100) NOT NULL DEFAULT 'United States',
    -- Credits (utils/importQuota.js): each AI import uses one. Free credits (3 guest / 50 user, for
    -- the life of the account) are counted in ai_import_usage; import_credits is the balance on top,
    -- from purchases and restores. There's no separate "paid" kind of account.
    --
    -- When and where ('stripe' or 'apple') the account first bought credits. 'promo' marks a few
    -- early accounts given credits by an old free giveaway.
    first_purchased_at TIMESTAMP,
    purchase_platform VARCHAR(10) CHECK (purchase_platform IS NULL OR purchase_platform IN ('stripe', 'apple', 'promo')),
    -- Credit balance, used after the free credits; purchases and restores add to it.
    import_credits INTEGER NOT NULL DEFAULT 0,
    -- The iPhone's device id (iPhone app only). A deleted account's device id is recorded in
    -- spent_trials, so a new guest on that phone gets no free guest credits.
    device_id VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Usernames are unique ignoring case ("Test" and "test" are the same account).
CREATE UNIQUE INDEX idx_users_username_lower ON users (LOWER(username));

-- Deleted accounts' emails and device ids, stored only as one-way codes ('h1:' + HMAC-SHA256, see
-- models/SpentTrial.js). Signing up with such an email goes through a verification link, then gets
-- the deleted account's leftover credits (credits_left, given once) and no new free credits. A
-- guest on such a device gets no guest credits. had_purchase/purchase_platform record whether that
-- account bought credits, and where.
CREATE TABLE spent_trials (
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('email', 'device')),
    value VARCHAR(200) NOT NULL,
    had_purchase BOOLEAN NOT NULL DEFAULT FALSE,
    purchase_platform VARCHAR(10),
    credits_left INTEGER,
    spent_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (kind, value)
);

-- Apple purchases already turned into credits, so each one is only counted once and only for one
-- account (see models/ApplePurchase.js).
CREATE TABLE apple_purchases (
    original_transaction_id VARCHAR(64) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    claimed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Stripe checkouts already turned into credits, so a resent Stripe event doesn't add them twice
-- (see models/StripePurchase.js).
CREATE TABLE stripe_purchases (
    session_id VARCHAR(128) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    claimed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Each user's AI imports per month; the lifetime total is what free credits are counted against
-- (utils/importQuota.js). Every import attempt counts, even one that found nothing.
CREATE TABLE ai_import_usage (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month VARCHAR(7) NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, month)
);

-- Booking emails forwarded to a user's address (routes/webhookRoutes.js), already read by AI and
-- waiting for the user to review and pick a trip (routes/emailImportRoutes.js). legs_json holds
-- the extracted entries.
CREATE TABLE pending_email_imports (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(20) NOT NULL CHECK (category IN ('flight', 'transportation', 'lodging', 'restaurant', 'car', 'tour', 'activity')),
    legs_json JSONB NOT NULL,
    from_address VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pending_email_imports_user_id ON pending_email_imports(user_id);

-- Who can open each trip. All members are equal (no owner). "Deleting" a trip removes your own
-- row; the trip itself is deleted when its last member leaves (models/Membership.js).
-- last_accessed_at orders the Home list.
CREATE TABLE trip_members (
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trip_id, user_id)
);

-- Who can open each packing list, the same way as trip_members.
CREATE TABLE packlist_members (
    packlist_id INTEGER NOT NULL REFERENCES packlists(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (packlist_id, user_id)
);

-- Indexes for listing a user's trips and packing lists.
CREATE INDEX idx_trip_members_user_id ON trip_members(user_id);
CREATE INDEX idx_packlist_members_user_id ON packlist_members(user_id);

-- Which packing lists each member sees on a trip. Each member has their own links: someone joining
-- a trip gets the lists linked for everyone (for_everyone), and after that unlinking or swapping in
-- a copy only changes their own view. for_everyone false is an "Only me" list, never given to new
-- members. Deleting the trip, the user or the packing list only removes links.
CREATE TABLE trip_packlists (
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    packlist_id INTEGER NOT NULL REFERENCES packlists(id) ON DELETE CASCADE,
    linked_at TIMESTAMP NOT NULL DEFAULT NOW(),
    for_everyone BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (trip_id, user_id, packlist_id)
);

CREATE INDEX idx_trip_packlists_packlist_id ON trip_packlists(packlist_id);
CREATE INDEX idx_trip_packlists_user_id ON trip_packlists(user_id);

-- Flight routes by flight number (trimmed, uppercased), shared by every user (models/CachedFlight.js).
-- Scheduled times only, never live status.
CREATE TABLE cached_flights (
    flight_number VARCHAR(10) PRIMARY KEY,
    airline VARCHAR(100),
    dep_airport VARCHAR(100),
    dep_time VARCHAR(20),
    arr_airport VARCHAR(100),
    arr_time VARCHAR(20),
    -- Days between departure and arrival (0 = same day). Stored instead of dates, since the
    -- lookup can't know which date the trip's flight is.
    arr_day_offset INTEGER,
    duration VARCHAR(20),
    last_updated TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Typical weather (the average of the same calendar day over the last 3 years) by place and
-- month/day, shared by every user (utils/weatherHistory.js). Coordinates are rounded to 0.1°
-- (about 11 km) so nearby places share an answer.
CREATE TABLE weather_history_cache (
    lat_rounded DOUBLE PRECISION NOT NULL,
    lon_rounded DOUBLE PRECISION NOT NULL,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    hi_f DOUBLE PRECISION,
    lo_f DOUBLE PRECISION,
    avg_humidity DOUBLE PRECISION,
    last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (lat_rounded, lon_rounded, month, day)
);

-- Place name -> coordinates, shared by every user (utils/geocode.js). lat/lon are null when the
-- place wasn't found (that answer is cached too).
CREATE TABLE geocode_cache (
    query_key VARCHAR(200) PRIMARY KEY,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    city VARCHAR(200),
    country VARCHAR(200),
    last_updated TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Calls per month to outside APIs with monthly limits (AeroDataBox, AviationStack, and counts
-- for others like OpenAI and Open-Meteo) — see models/ApiUsage.js. Cached answers aren't counted.
CREATE TABLE api_usage (
    provider VARCHAR(30) NOT NULL,
    month VARCHAR(7) NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (provider, month)
);

-- Trip Tips (visa tip and local tips), shared by every user, by trip title and passport country
-- (models/CachedTripTips.js). destination_key lets other titles for the same place reuse the row.
-- resolved_* is the one city the AI found, if any, used for the plug and weather sections.
-- last_verified: the route regenerates tips after 75 days (1 day for "no destination").
CREATE TABLE cached_trip_tips (
    title_key VARCHAR(200) NOT NULL,
    passport_country VARCHAR(100) NOT NULL DEFAULT 'United States',
    destination_key VARCHAR(200),
    has_destination BOOLEAN NOT NULL DEFAULT FALSE,
    tip_text TEXT,
    source_label VARCHAR(200),
    source_url TEXT,
    resolved_city VARCHAR(100),
    resolved_country VARCHAR(100),
    resolved_lat DOUBLE PRECISION,
    resolved_lon DOUBLE PRECISION,
    experiential_tips_json JSONB,
    -- For a trip to several places: the AI-written weather summary (utils/multiDestinationWeather.js).
    multi_weather_summary TEXT,
    last_verified TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (title_key, passport_country)
);

-- For finding tips by destination and passport (several titles can share a destination).
CREATE INDEX idx_cached_trip_tips_destination_key ON cached_trip_tips (destination_key, passport_country);

-- Invites to join a trip or packing list, sent by username. The invited user accepts (joins) or
-- declines on Home; either way the invite is deleted.
CREATE TABLE invites (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
    packlist_id INTEGER REFERENCES packlists(id) ON DELETE CASCADE,
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK ((trip_id IS NULL) <> (packlist_id IS NULL))
);
CREATE UNIQUE INDEX idx_invites_trip ON invites(trip_id, to_user_id) WHERE trip_id IS NOT NULL;
CREATE UNIQUE INDEX idx_invites_packlist ON invites(packlist_id, to_user_id) WHERE packlist_id IS NOT NULL;
CREATE INDEX idx_invites_to_user ON invites(to_user_id);
