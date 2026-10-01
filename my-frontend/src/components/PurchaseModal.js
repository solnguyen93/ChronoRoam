import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { NativePurchases } from '@capgo/native-purchases';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import useBackdropDismiss from '../hooks/useBackdropDismiss';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';
import { useAuth } from '../AuthContext';
import { useBillingStatus } from '../hooks/useBillingStatus';
import ChronoRoamApi from '../api';

// The App Store product for 100 credits. Must match CREDITS_BY_PRODUCT in
// my-backend/utils/appleReceiptVerification.js.
const APPLE_PRODUCT_ID = 'com.solnguyen.chronoroam.100';

// Loads Stripe once for the whole app. The publishable key is meant to be public; the secret key
// is only on the server.
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

// The product's name, the same here, on the Stripe checkout (my-backend/routes/billingRoutes.js)
// and in App Store Connect.
const CREDITS_PRODUCT_NAME = '100 Credits';

// Reloads the current page after a purchase, so every part of the app shows the new credit
// count. (Each component loads the credit count on its own, so refreshing just this one isn't
// enough.)
function goConfirmPurchase() {
    window.location.reload();
}

// The purchase popup. Opened from Account's "Buy more" (no reason), or when something runs out:
// reason="import" for an import at 0 credits, "trip"/"packlist" for a guest's 1-trip or
// 1-list limit. The reason only changes the explanation line.
function PurchaseModal({ open, onClose, reason }) {
    const { isGuest } = useAuth();
    const billing = useBillingStatus();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    // On web: set after tapping Buy. Shows Stripe's payment form inside this popup.
    const [clientSecret, setClientSecret] = useState(null);
    // True once Stripe says the payment went through (opening the form alone doesn't set it).
    const [paymentComplete, setPaymentComplete] = useState(false);
    // Up/down arrow buttons for scrolling the Stripe payment form.
    const { canBack: canScrollUp, canForward: canScrollDown, idle: checkoutIdle, scrollBack: scrollCheckoutUp, scrollForward: scrollCheckoutDown, ref: checkoutScrollRef } = useScrollArrows('y', [clientSecret]);
    // Up/down arrow buttons for scrolling the whole popup.
    const { canBack: outerCanBack, canForward: outerCanForward, idle: outerIdle, scrollBack: outerScrollBack, scrollForward: outerScrollForward, ref: outerScrollRef } = useScrollArrows('y', [clientSecret, isGuest, billing?.hasPurchased]);

    // Closing: after a completed payment, reloads the page (see goConfirmPurchase). Otherwise
    // clears the payment form and error so the next open starts fresh, and closes.
    const handleClose = () => {
        if (paymentComplete) {
            goConfirmPurchase();
            return;
        }
        setClientSecret(null);
        setPaymentComplete(false);
        setError('');
        onClose();
    };

    const backdrop = useBackdropDismiss(handleClose);

    // Load the credit count again each time the popup opens (it's only loaded once otherwise).
    const refreshBilling = billing.refresh;
    useEffect(() => {
        if (open) refreshBilling();
    }, [open, refreshBilling]);

    if (!open) return null;

    const isNative = Capacitor.isNativePlatform();

    const doPurchase = async (productId) => {
        setError('');
        setBusy(true);
        try {
            // iPhone purchase: Apple's purchase sheet, then our server checks the receipt and
            // adds the credits.
            const transaction = await NativePurchases.purchaseProduct({ productIdentifier: productId });
            await ChronoRoamApi.verifyApplePurchase(transaction.jwsRepresentation);
            goConfirmPurchase();
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Purchase failed.');
        } finally {
            setBusy(false);
        }
    };

    const doStripeCheckout = async () => {
        setError('');
        setBusy(true);
        try {
            const { clientSecret: secret } = await ChronoRoamApi.createStripeCheckout();
            setClientSecret(secret);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Could not start checkout.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="modal-overlay open" {...backdrop}>
            {/* Wider while the Stripe payment form is showing, since its fields need the room. */}
            <div className={'modal-box modal-box-flex-scroll' + (clientSecret ? ' modal-box-wide' : '')}>
                <button type="button" className="modal-close-btn" onClick={handleClose} aria-label="Close">×</button>
                <div className="v-scroll-wrap modal-box-outer-scroll-wrap">
                {outerCanBack && (
                    <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (outerIdle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={outerScrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                )}
                <div key="scroll-body" className="modal-box-outer-scroll-body" ref={outerScrollRef}>

                {/* A guest can't buy credits (a purchase needs an account), so they get a
                    "Create an account" message instead, saying which limit they hit. */}
                {isGuest ? (
                    <>
                        <h3>Create an account to continue</h3>
                        <p className="modal-sub">
                            {reason === 'import'
                                ? `You've used your ${billing?.limit ?? 3} guest credits. `
                                : reason === 'trip' || reason === 'packlist'
                                    ? `Guests can have 1 ${reason === 'trip' ? 'trip' : 'packlist'}. `
                                    : ''}
                            <Link to="/register" onClick={handleClose}>Create an account</Link>
                            {reason === 'import' ? ` for ${billing?.freeImportLimit ?? 50} free credits` : reason === 'trip' || reason === 'packlist' ? ' for unlimited trips and packlists' : ' to use this'}
                            , or <Link to="/login" onClick={handleClose}>sign in</Link>. Anything you've made carries over.
                        </p>
                    </>
                ) : (
                    <h3>Credits</h3>
                )}

                {/* The credit balance. Hidden while the payment form is showing. */}
                {!isGuest && !clientSecret && (
                    <p className="modal-sub">
                        You have <strong>{billing?.remaining === undefined ? '…' : billing.remaining.toLocaleString('en-US')}</strong> credit{billing?.remaining === 1 ? '' : 's'}.
                        {/* Opened by an import at 0 credits: says why. */}
                        {reason === 'import' && billing?.remaining === 0 && ' Each import uses one credit, so buy more to keep importing.'}
                    </p>
                )}

                {isGuest ? null : clientSecret ? (
                    <div className="v-scroll-wrap">
                        {canScrollUp && (
                            <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (checkoutIdle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={scrollCheckoutUp}><CollapseChevron collapsed={false} size={16} /></button>
                        )}
                        <div key="scroll-body" className="stripe-embedded-checkout" ref={checkoutScrollRef}>
                            <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret, onComplete: () => setPaymentComplete(true) }}>
                                <EmbeddedCheckout />
                            </EmbeddedCheckoutProvider>
                        </div>
                        {canScrollDown && (
                            <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (checkoutIdle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={scrollCheckoutDown}><CollapseChevron collapsed={true} size={16} /></button>
                        )}
                    </div>
                ) : isNative ? (
                    <>
                        {error && <div className="modal-error">{error}</div>}
                        <div className="modal-btns" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                            <button type="button" className="confirm" onClick={() => doPurchase(APPLE_PRODUCT_ID)} disabled={busy}>Buy {CREDITS_PRODUCT_NAME} — $5</button>
                        </div>
                    </>
                ) : (
                    <>
                        {error && <div className="modal-error">{error}</div>}
                        <div className="modal-btns">
                            <button type="button" className="confirm" onClick={doStripeCheckout} disabled={busy}>
                                {busy ? 'Loading…' : `Buy ${CREDITS_PRODUCT_NAME} — $5`}
                            </button>
                        </div>
                    </>
                )}
                </div>
                {outerCanForward && (
                    <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (outerIdle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={outerScrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                )}
                </div>
            </div>
        </div>
    );
}

export default PurchaseModal;
