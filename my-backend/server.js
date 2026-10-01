// Starts the API server: sets up middleware, mounts every route, runs startup database changes,
// then listens for requests.
const express = require('express');
const SpentTrial = require('./models/SpentTrial');
const { runMigrations } = require('./utils/migrations');
const cors = require('cors');
const tripRoutes = require('./routes/tripRoutes');
const todoRoutes = require('./routes/todoRoutes');
const taskRoutes = require('./routes/taskRoutes');
const packlistRoutes = require('./routes/packlistRoutes');
const packlistItemRoutes = require('./routes/packlistItemRoutes');
const packlistBagRoutes = require('./routes/packlistBagRoutes');
const tripPacklistRoutes = require('./routes/tripPacklistRoutes');
const authRoutes = require('./routes/authRoutes');
const flightRoutes = require('./routes/flightRoutes');
const aiRoutes = require('./routes/aiRoutes');
const weatherRoutes = require('./routes/weatherRoutes');
const geocodeRoutes = require('./routes/geocodeRoutes');
const emailImportRoutes = require('./routes/emailImportRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const billingRoutes = require('./routes/billingRoutes');
const contactRoutes = require('./routes/contactRoutes');
const inviteRoutes = require('./routes/inviteRoutes');
const { stripeWebhook } = require('./routes/stripeWebhook');
const { authenticateJWT } = require('./middleware/auth');
require('dotenv').config();

const app = express();

// Health check for the keep-alive ping (.github/workflows/keep-alive.yml), which stops Render's
// free hosting from putting the server to sleep after 15 idle minutes. Needs no body parsing or
// login, so it's registered first.
app.get('/health', (req, res) => res.status(200).send('ok'));

// Allow the web app (on a different domain) to call this API.
app.use(cors());
// Stripe's webhook needs the raw request body to check Stripe's signature, so it's registered
// before the JSON parser below, which would otherwise turn the body into an object first.
app.post('/billing/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook);
// Parse JSON request bodies for every other route.
app.use(express.json());
// Read the login token, if any, into res.locals.user. Routes that need a login check it
// themselves with requireUser (see middleware/auth.js).
app.use(authenticateJWT);

// Routes
app.use('/auth', authRoutes);                            // Sign up, sign in, guests, account settings, password reset
app.use('/trips', tripRoutes);                          // Trips
app.use('/trips/:publicId/todos', todoRoutes);           // A trip's to-do list
app.use('/trips/:publicId/tasks', taskRoutes);           // A trip's day-by-day items
app.use('/trips/:publicId/packlists', tripPacklistRoutes); // Packing lists linked to a trip
app.use('/packlists', packlistRoutes);                   // Packing lists
app.use('/packlists/:publicId/items', packlistItemRoutes); // Packing list items
app.use('/packlists/:publicId/bags', packlistBagRoutes);  // Packing list bags
app.use('/invites', inviteRoutes);                        // Invites to a trip or packing list by username
app.use('/flights', flightRoutes);                        // Flight number lookup
app.use('/ai', aiRoutes);                                 // AI imports and Trip Tips
app.use('/weather', weatherRoutes);                       // Typical weather for a date and place
app.use('/geocode', geocodeRoutes);                       // Place name to coordinates
app.use('/email-imports', emailImportRoutes);             // Forwarded booking emails waiting for review
app.use('/webhooks', webhookRoutes);                      // Forwarded emails arriving from the Cloudflare email worker
app.use('/billing', billingRoutes);                       // Credit balance, guest limits and purchases
app.use('/contact', contactRoutes);                       // Contact form

const PORT = process.env.PORT || 5000;

// Apply database changes first (utils/migrations.js), so no request runs against old column
// names, then start taking requests.
runMigrations()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            // Convert any deleted-account rows still holding a plain email or device ID into
            // one-way codes (models/SpentTrial.js). Does nothing once all rows are converted.
            SpentTrial.hashLegacyRows()
                .then((n) => { if (n) console.log(`spent_trials: hashed ${n} legacy row(s)`); })
                .catch((err) => console.error('spent_trials legacy hashing failed:', err.message));
        });
    })
    .catch((err) => {
        console.error('Startup migrations failed:', err);
        process.exit(1);
    });
