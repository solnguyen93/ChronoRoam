const fs = require('fs');
const path = require('path');
const { SignedDataVerifier, Environment, VerificationException, VerificationStatus } = require('@apple/app-store-server-library');
const { BadRequestError } = require('../expressError');
const { PURCHASE_CREDIT_GRANT } = require('./creditGrants');

// Checks Apple purchases from the iPhone app with Apple, before credits are added.

// The iPhone app's bundle id (must match capacitor.config.ts's appId).
const BUNDLE_ID = 'com.solnguyen.chronoroam';
// The app's number in App Store Connect (the app's, not the in-app purchase's). Needed for
// checking real (production) purchases.
const APPLE_APP_ID = 6801000067;

// The credits product (every Apple purchase uses it) and how many credits each product adds.
const CREDITS_PRODUCT_ID = 'com.solnguyen.chronoroam.1000'; // "1000 imports" in App Store Connect
const CREDITS_BY_PRODUCT = { [CREDITS_PRODUCT_ID]: PURCHASE_CREDIT_GRANT };

// Apple's public root certificate (not a secret), used to check a purchase was signed by Apple.
const rootCert = fs.readFileSync(path.join(__dirname, '../certs/AppleRootCA-G3.cer'));

// Two checkers: real purchases come from Apple's production environment, and test purchases
// (TestFlight, App Review) from sandbox. Both also ask Apple whether the purchase was refunded.
const prodVerifier = new SignedDataVerifier([rootCert], true, Environment.PRODUCTION, BUNDLE_ID, APPLE_APP_ID);
const sandboxVerifier = new SignedDataVerifier([rootCert], true, Environment.SANDBOX, BUNDLE_ID);

// Checks a purchase the app sends (Apple's signed jwsRepresentation): signed by Apple, for our
// product, and not refunded. Tries production first, and sandbox only when Apple says it's a
// sandbox purchase. Returns the purchase details, or throws.
async function verifyAppleTransaction(jwsRepresentation) {
    let decoded;
    try {
        decoded = await prodVerifier.verifyAndDecodeTransaction(jwsRepresentation);
    } catch (err) {
        if (err instanceof VerificationException && err.status === VerificationStatus.INVALID_ENVIRONMENT) {
            decoded = await sandboxVerifier.verifyAndDecodeTransaction(jwsRepresentation);
        } else {
            throw err;
        }
    }
    if (!(decoded.productId in CREDITS_BY_PRODUCT)) {
        throw new BadRequestError(`Unexpected product ID: ${decoded.productId}`);
    }
    if (decoded.revocationDate) {
        throw new BadRequestError('This purchase was refunded and is no longer valid.');
    }
    return decoded;
}

module.exports = { verifyAppleTransaction, CREDITS_PRODUCT_ID, CREDITS_BY_PRODUCT };
