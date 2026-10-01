// The shared Postgres connection pool every model uses.
const { Pool } = require('pg');
// Load .env when there is one (local development). On Render there's no .env file, and the
// settings come from Render's environment instead.
require('dotenv').config();

let pool;

// Production database (Neon): on Render (NODE_ENV=production), or locally only when USE_PROD_DB
// is set on purpose (npm run start:prod). Plain `npm start` locally never connects to it.
if (process.env.USE_PROD_DB === 'true' || process.env.NODE_ENV === 'production') {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });
} else {
    // Local development database, from the PG* settings in .env.
    pool = new Pool({
        user: process.env.PGUSER,
        host: process.env.PGHOST || 'localhost',
        database: process.env.PGDATABASE,
        password: process.env.PGPASSWORD,
        port: process.env.PGPORT || 5432,
    });
}

module.exports = pool;
