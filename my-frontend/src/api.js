import axios from 'axios';
import { noteRecentEmoji } from './utils/recentEmoji';

// The server's address.
export const BASE_URL = process.env.REACT_APP_BASE_URL || 'http://localhost:5000';

// Shows "Paste confirmation email" in the add-item popup when the build sets
// REACT_APP_ENABLE_AI_FLIGHT_EXTRACTION=true. The server also needs ANTHROPIC_API_KEY.
export const AI_FLIGHT_EXTRACTION_ENABLED = process.env.REACT_APP_ENABLE_AI_FLIGHT_EXTRACTION === 'true';

// Checks for forwarded booking emails to review when the build sets
// REACT_APP_ENABLE_EMAIL_IMPORT=true. The server also needs EMAIL_INTAKE_SHARED_SECRET.
export const EMAIL_IMPORT_ENABLED = process.env.REACT_APP_ENABLE_EMAIL_IMPORT === 'true';

// A random id for this open copy of the app, sent with every request. The server uses it so
// live updates (hooks/useLiveUpdates.js) don't tell this copy about its own changes.
export const CLIENT_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

// Every call to our server. Each method is one server route.
class ChronoRoamApi {
    // Sends a request with the saved login token and returns the response body. GET sends data
    // as query parameters; other methods send it as the body.
    static async request(endpoint, data = {}, method = 'get') {
        const url = `${BASE_URL}/${endpoint}`;
        const params = method === 'get' ? data : {};
        const token = localStorage.getItem('token');
        const headers = { Authorization: token ? `Bearer ${token}` : undefined, 'X-Client-Id': CLIENT_ID };
        const attempt = () => axios({ url, method, data, params, headers });

        try {
            const res = await attempt();
            return res.data;
        } catch (initialError) {
            // On a 401 (not signed in), tries once more after 600ms before signing out. Right
            // after signing up, the server's check that the user exists can briefly miss the
            // new account; a token that's really invalid fails the second try too.
            let error = initialError;
            if (error.response?.status === 401 && token) {
                try {
                    await new Promise((resolve) => setTimeout(resolve, 600));
                    const retryRes = await attempt();
                    return retryRes.data;
                } catch (retryError) {
                    error = retryError;
                }
            }
            console.error('API Error:', error);
            // Still 401: removes the token and goes to the sign-in page.
            if (error.response?.status === 401) {
                localStorage.removeItem('token');
                // "#/login" because the app uses hash routing (App.js).
                window.location.href = '#/login';
            }
            throw error;
        }
    }

    static async register(name, username, email, password, location, deviceId) {
        return ChronoRoamApi.request('auth/register', { name, username, email, password, location, deviceId }, 'post');
    }

    // Whether an email is taken or was used before (for the sign-up form, AuthPage.js).
    static async checkEmail(email) {
        return ChronoRoamApi.request('auth/check-email', { email }, 'get');
    }

    // Whether a username is taken (for the sign-up form).
    static async checkUsername(username) {
        return ChronoRoamApi.request('auth/check-username', { username }, 'get');
    }

    static async continueAsGuest(deviceId) {
        return ChronoRoamApi.request('auth/guest', { deviceId }, 'post');
    }

    static async claimAccount(data) {
        return ChronoRoamApi.request('auth/claim', data, 'put');
    }

    static async login(username, password) {
        return ChronoRoamApi.request('auth/login', { username, password }, 'post');
    }

    static async demoLogin() {
        return ChronoRoamApi.request('auth/demo-login', {}, 'post');
    }

    static async mergeGuestLogin(username, password) {
        return ChronoRoamApi.request('auth/merge-guest', { username, password }, 'put');
    }

    static async forgotPassword(email) {
        return ChronoRoamApi.request('auth/forgot-password', { email }, 'post');
    }

    static async resetPassword(token, password) {
        return ChronoRoamApi.request('auth/reset-password', { token, password }, 'post');
    }

    // Confirms the link from the "verify it's you" email (VerifyRestorePage.js): creates the
    // account and gives back its leftover credits.
    static async verifyRestore(token) {
        return ChronoRoamApi.request('auth/verify-restore', { token }, 'post');
    }

    static async updateProfile(data) {
        return ChronoRoamApi.request('auth/profile', data, 'put');
    }

    // Confirms the link sent to a new email address (VerifyEmailChangePage.js).
    static async verifyEmailChange(token) {
        return ChronoRoamApi.request('auth/verify-email-change', { token }, 'post');
    }

    static async deleteAccount(currentPassword) {
        return ChronoRoamApi.request('auth/profile', { currentPassword }, 'delete');
    }

    static async createTrip(title, startDate, endDate, destinations) {
        return ChronoRoamApi.request('trips', { title, startDate, endDate, destinations }, 'post');
    }

    // join: true only when opened from a share link; the server then adds the user to the trip.
    // Normal visits and background refreshes don't.
    static async getTrip(tripId, join = false) {
        return ChronoRoamApi.request(`trips/${tripId}${join ? '?join=1' : ''}`);
    }

    static async getMyTrips() {
        return ChronoRoamApi.request('trips');
    }

    static async getBillingStatus() {
        return ChronoRoamApi.request('billing/status');
    }

    static async verifyApplePurchase(jwsRepresentation) {
        return ChronoRoamApi.request('billing/apple/verify', { jwsRepresentation }, 'post');
    }

    // Starts a Stripe payment for 1,000 credits, shown inside the purchase popup (billingRoutes.js).
    static async createStripeCheckout() {
        return ChronoRoamApi.request('billing/stripe/checkout', {}, 'post');
    }


    // Invites someone to a trip or packing list by username (kind 'trip' or 'packlist').
    static async sendInvite(kind, publicId, username) {
        return ChronoRoamApi.request('invites', { kind, publicId, username }, 'post');
    }

    // This user's invites: { invites: [{ id, kind, publicId, title, startDate, endDate, fromName }] }.
    static async getInvites() {
        return ChronoRoamApi.request('invites');
    }

    // Accepts an invite; returns { kind, publicId } to open.
    static async acceptInvite(id) {
        return ChronoRoamApi.request(`invites/${id}/accept`, {}, 'post');
    }

    static async declineInvite(id) {
        return ChronoRoamApi.request(`invites/${id}`, {}, 'delete');
    }

    static async sendContactMessage(data) {
        return ChronoRoamApi.request('contact', data, 'post');
    }

    static async updateTrip(tripId, data) {
        return ChronoRoamApi.request(`trips/${tripId}`, data, 'put');
    }

    static async setDayTitle(tripId, dateISO, title) {
        return ChronoRoamApi.request(`trips/${tripId}/day-titles/${dateISO}`, { title }, 'put');
    }

    static async setTodoTitle(tripId, title) {
        return ChronoRoamApi.request(`trips/${tripId}/todo-title`, { title }, 'put');
    }

    static async duplicateTrip(tripId) {
        return ChronoRoamApi.request(`trips/${tripId}/duplicate`, {}, 'post');
    }

    static async deleteTrip(tripId) {
        return ChronoRoamApi.request(`trips/${tripId}`, {}, 'delete');
    }

    static async addTodo(tripId, text, tags = {}) {
        return ChronoRoamApi.request(`trips/${tripId}/todos`, { text, tags }, 'post');
    }

    static async updateTodo(tripId, todoId, data) {
        return ChronoRoamApi.request(`trips/${tripId}/todos/${todoId}`, data, 'put');
    }

    static async deleteTodo(tripId, todoId) {
        return ChronoRoamApi.request(`trips/${tripId}/todos/${todoId}`, {}, 'delete');
    }

    static async reorderTodos(tripId, orderedIds) {
        return ChronoRoamApi.request(`trips/${tripId}/todos/reorder`, { orderedIds }, 'put');
    }

    static async uncheckAllTodos(tripId) {
        return ChronoRoamApi.request(`trips/${tripId}/todos/uncheck-all`, {}, 'put');
    }

    static async addTask(tripId, task) {
        return ChronoRoamApi.request(`trips/${tripId}/tasks`, task, 'post');
    }

    static async updateTask(tripId, taskId, data) {
        return ChronoRoamApi.request(`trips/${tripId}/tasks/${taskId}`, data, 'put');
    }

    static async deleteTask(tripId, taskId) {
        return ChronoRoamApi.request(`trips/${tripId}/tasks/${taskId}`, {}, 'delete');
    }

    static async reorderTasks(tripId, dayDate, orderedIds) {
        return ChronoRoamApi.request(`trips/${tripId}/tasks/reorder`, { dayDate, orderedIds }, 'put');
    }

    // Moves a day item to another day. For a linked pair (flight or transportation depart and
    // arrive, lodging check-in and check-out), the server moves the other half by the same number
    // of days (Task.moveToDay).
    static async moveTaskDay(tripId, taskId, dayDate) {
        return ChronoRoamApi.request(`trips/${tripId}/tasks/${taskId}/move-day`, { dayDate }, 'put');
    }

    // Packing lists (the Packing Lists tab and a packing list's own page).
    static async createPacklist(title) {
        return ChronoRoamApi.request('packlists', { title }, 'post');
    }

    static async getMyPacklists() {
        return ChronoRoamApi.request('packlists');
    }

    static async getPacklist(packlistId, join = false) {
        return ChronoRoamApi.request(`packlists/${packlistId}${join ? '?join=1' : ''}`);
    }

    static async renamePacklist(packlistId, title) {
        return ChronoRoamApi.request(`packlists/${packlistId}`, { title }, 'put');
    }

    static async duplicatePacklist(packlistId) {
        return ChronoRoamApi.request(`packlists/${packlistId}/duplicate`, {}, 'post');
    }

    static async deletePacklist(packlistId) {
        return ChronoRoamApi.request(`packlists/${packlistId}`, {}, 'delete');
    }

    // The trips this packing list is linked to (shown in the delete warning).
    static async getTripsLinkingPacklist(packlistId) {
        return ChronoRoamApi.request(`packlists/${packlistId}/trips`);
    }

    // bagId null means not in a bag. These and the bag calls below return the whole list's
    // { items, bags }. Adding or editing an item also remembers its emoji for the recent-emoji
    // button (utils/recentEmoji.js).
    static async addPacklistItem(packlistId, text, bagId = null, tags = {}) {
        noteRecentEmoji(text, 'packlist');
        return ChronoRoamApi.request(`packlists/${packlistId}/items`, { text, bagId, ...tags }, 'post');
    }

    static async updatePacklistItem(packlistId, itemId, data) {
        noteRecentEmoji(data.text, 'packlist');
        return ChronoRoamApi.request(`packlists/${packlistId}/items/${itemId}`, data, 'put');
    }

    static async movePacklistItem(packlistId, itemId, bagId, orderedIds) {
        return ChronoRoamApi.request(`packlists/${packlistId}/items/${itemId}/move`, { bagId, orderedIds }, 'put');
    }

    static async deletePacklistItem(packlistId, itemId) {
        return ChronoRoamApi.request(`packlists/${packlistId}/items/${itemId}`, {}, 'delete');
    }

    static async reorderPacklistItems(packlistId, orderedIds) {
        return ChronoRoamApi.request(`packlists/${packlistId}/items/reorder`, { orderedIds }, 'put');
    }

    static async uncheckAllPacklistItems(packlistId) {
        return ChronoRoamApi.request(`packlists/${packlistId}/items/uncheck-all`, {}, 'put');
    }

    static async addPacklistBag(packlistId, parentBagId, name, color) {
        return ChronoRoamApi.request(`packlists/${packlistId}/bags`, { parentBagId, name, color }, 'post');
    }

    static async updatePacklistBag(packlistId, bagId, data) {
        return ChronoRoamApi.request(`packlists/${packlistId}/bags/${bagId}`, data, 'put');
    }

    static async movePacklistBag(packlistId, bagId, parentBagId, orderedIds) {
        return ChronoRoamApi.request(`packlists/${packlistId}/bags/${bagId}/move`, { parentBagId, orderedIds }, 'put');
    }

    static async deletePacklistBag(packlistId, bagId) {
        return ChronoRoamApi.request(`packlists/${packlistId}/bags/${bagId}`, {}, 'delete');
    }

    // Packing lists linked to a trip (a trip can have several), and edits to them from the trip
    // page. Each trip member has their own set of linked lists. linkPacklist links it for this user,
    // or for everyone on the trip with forEveryone; it fails with 409 (alreadyLinked) when the list is
    // already on this trip for this user.
    static async linkPacklist(tripId, packlistId, forEveryone = false) {
        return ChronoRoamApi.request(`trips/${tripId}/packlists`, { packlistId, forEveryone }, 'post');
    }

    // Copies a packing list and links the copy to the trip; with replace, the copy takes the
    // original's place on the trip for this user. Without replace, forEveryone links the copy for
    // everyone on the trip.
    static async duplicateAndLinkPacklist(tripId, packlistId, replace = false, forEveryone = false) {
        return ChronoRoamApi.request(`trips/${tripId}/packlists/duplicate-and-link`, { packlistId, replace, forEveryone }, 'post');
    }

    static async unlinkPacklist(tripId, packlistId) {
        return ChronoRoamApi.request(`trips/${tripId}/packlists/${packlistId}`, {}, 'delete');
    }

    static async renameTripPacklist(tripId, packlistId, title) {
        return ChronoRoamApi.request(`trips/${tripId}/packlists/${packlistId}/rename`, { title }, 'put');
    }

    static async addTripPacklistItem(tripId, packlistId, text, bagId = null, tags = {}) {
        noteRecentEmoji(text, 'packlist');
        return ChronoRoamApi.request(`trips/${tripId}/packlists/${packlistId}/items`, { text, bagId, ...tags }, 'post');
    }

    static async updateTripPacklistItem(tripId, packlistId, itemId, data) {
        noteRecentEmoji(data.text, 'packlist');
        return ChronoRoamApi.request(`trips/${tripId}/packlists/${packlistId}/items/${itemId}`, data, 'put');
    }

    static async moveTripPacklistItem(tripId, packlistId, itemId, bagId, orderedIds) {
        return ChronoRoamApi.request(`trips/${tripId}/packlists/${packlistId}/items/${itemId}/move`, { bagId, orderedIds }, 'put');
    }

    static async deleteTripPacklistItem(tripId, packlistId, itemId) {
        return ChronoRoamApi.request(`trips/${tripId}/packlists/${packlistId}/items/${itemId}`, {}, 'delete');
    }

    static async reorderTripPacklistItems(tripId, packlistId, orderedIds) {
        return ChronoRoamApi.request(`trips/${tripId}/packlists/${packlistId}/items/reorder`, { orderedIds }, 'put');
    }

    static async uncheckAllTripPacklistItems(tripId, packlistId) {
        return ChronoRoamApi.request(`trips/${tripId}/packlists/${packlistId}/items/uncheck-all`, {}, 'put');
    }

    static async addTripPacklistBag(tripId, packlistId, parentBagId, name, color) {
        return ChronoRoamApi.request(`trips/${tripId}/packlists/${packlistId}/bags`, { parentBagId, name, color }, 'post');
    }

    static async updateTripPacklistBag(tripId, packlistId, bagId, data) {
        return ChronoRoamApi.request(`trips/${tripId}/packlists/${packlistId}/bags/${bagId}`, data, 'put');
    }

    static async moveTripPacklistBag(tripId, packlistId, bagId, parentBagId, orderedIds) {
        return ChronoRoamApi.request(`trips/${tripId}/packlists/${packlistId}/bags/${bagId}/move`, { parentBagId, orderedIds }, 'put');
    }

    static async deleteTripPacklistBag(tripId, packlistId, bagId) {
        return ChronoRoamApi.request(`trips/${tripId}/packlists/${packlistId}/bags/${bagId}`, {}, 'delete');
    }

    // A flight's schedule (airports, times, duration), from our cache or AviationStack
    // (my-backend/routes/flightRoutes.js). No live status, gate or delay.
    static async getFlight(flightNumber) {
        return ChronoRoamApi.request(`flights/${encodeURIComponent(flightNumber)}`, {}, 'get');
    }

    // Saves the user's corrections to a flight's cached schedule.
    static async saveFlightCorrection(flightNumber, data) {
        return ChronoRoamApi.request(`flights/${encodeURIComponent(flightNumber)}`, data, 'put');
    }

    // Average high, low and humidity on this month and day over the last 3 years, in Fahrenheit
    // ({ hiF, loF, avgHumidity }). useWeather.js converts to Celsius when needed.
    static async getHistoricalWeather(lat, lon, month, day) {
        return ChronoRoamApi.request('weather/historical', { lat, lon, month, day }, 'get');
    }

    // A place name's location: { lat, lon, city, country }, or {} if not found
    // (my-backend/routes/geocodeRoutes.js).
    static async geocode(query) {
        return ChronoRoamApi.request('geocode', { q: query }, 'get');
    }

    // City suggestions for a place box: { results: [{ label, lat, lon, city, country }] }.
    static async searchCities(query) {
        return ChronoRoamApi.request('geocode/search', { q: query }, 'get');
    }

    // AI import of a pasted booking email (any category). Returns { category, legs: [...] };
    // category null means no booking was found. Uses one credit.
    static async extractConfirmation(emailText) {
        return ChronoRoamApi.request('ai/extract-confirmation', { emailText }, 'post');
    }

    // AI import of pasted list text (used for packing lists and to-dos). Returns
    // { groups: [{ groupName, items: [...] }] }, grouped by headings in the text (e.g. a
    // person's name); groupName "" means no heading. Uses one credit.
    static async extractPacklistItems(text) {
        return ChronoRoamApi.request('ai/extract-packlist-items', { text }, 'post');
    }

    // Forwarded booking emails waiting for this user to review (created by
    // my-backend/routes/webhookRoutes.js, reviewed in ConfirmationImportModal.js).
    // removeEmailImport is called after importing or dismissing one.
    static async getEmailImports() {
        return ChronoRoamApi.request('email-imports');
    }

    static async removeEmailImport(id) {
        return ChronoRoamApi.request(`email-imports/${id}`, {}, 'delete');
    }


    // Trip Tips (my-backend/routes/aiRoutes.js): visa and entry, outlets, weather compared with
    // home, and other tips. The server finds the destination from, in order: destinations, then
    // itineraryPlaces (cities from the day plan), then the trip title. Tips are cached on the
    // server for 75 days. Without homeLat/homeLon, the weather comparison is left out.
    static async getTripTips({ title, startDate, endDate, homeLat, homeLon, homeCountry, itineraryPlaces, destinations }) {
        return ChronoRoamApi.request('ai/trip-tips', { title, startDate, endDate, homeLat, homeLon, homeCountry, itineraryPlaces, destinations }, 'post');
    }
}

export default ChronoRoamApi;
