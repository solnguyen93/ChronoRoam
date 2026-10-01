import React, { createContext, useContext, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import ChronoRoamApi from './api';
import { getDeviceId } from './utils/deviceId';

const AuthContext = createContext();

// The signed-in user and every sign-in/sign-out action, shared with the whole app (useAuth()).
// The login token is kept in localStorage; the user comes from decoding it.
export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const token = localStorage.getItem('token');
        try {
            return token ? jwtDecode(token).user : null;
        } catch {
            return null;
        }
    });

    // True right after logging out, so the redirect to sign-in doesn't remember the page you were
    // on (the next account to sign in on this device shouldn't land on your trip). RequireAuth
    // (App.js) turns it off after that one redirect, and signing in turns it off too.
    const [justLoggedOut, setJustLoggedOut] = useState(false);

    // Saves a new login (token and user).
    const applyAuth = ({ user, token }) => {
        localStorage.setItem('token', token);
        setUser(user);
        setJustLoggedOut(false);
    };

    // Sign-up and guest sign-up return { pendingVerification: true } instead of a login when the
    // email belonged to a deleted account (a verification link was emailed); that's returned as is
    // so the sign-up page can say so.
    const register = async (name, username, email, password, location) => {
        const result = await ChronoRoamApi.register(name, username, email, password, location, await getDeviceId());
        if (!result.pendingVerification) applyAuth(result);
        return result;
    };
    const continueAsGuest = async () => applyAuth(await ChronoRoamApi.continueAsGuest(await getDeviceId()));
    const claimAccount = async (data) => {
        const result = await ChronoRoamApi.claimAccount({ ...data, deviceId: await getDeviceId() });
        if (!result.pendingVerification) applyAuth(result);
        return result;
    };
    const login = async (username, password) => applyAuth(await ChronoRoamApi.login(username, password));
    const demoLogin = async () => applyAuth(await ChronoRoamApi.demoLogin());
    const mergeGuestLogin = async (username, password) => applyAuth(await ChronoRoamApi.mergeGuestLogin(username, password));
    // Saves Account settings and returns the result, so AccountModal.js can see emailChangePending
    // (a new email waiting for its verification link).
    const updateProfile = async (data) => {
        const result = await ChronoRoamApi.updateProfile(data);
        applyAuth(result);
        return result;
    };
    const verifyRestore = async (token) => applyAuth(await ChronoRoamApi.verifyRestore(token));
    const verifyEmailChange = async (token) => applyAuth(await ChronoRoamApi.verifyEmailChange(token));

    // Signs out: forgets the login token on this device.
    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
        setJustLoggedOut(true);
    };

    // Deletes the account on the server, then signs out (RequireAuth then sends you to sign-in).
    const deleteAccount = async (currentPassword) => {
        await ChronoRoamApi.deleteAccount(currentPassword);
        logout();
    };

    // A guest account has no username yet.
    const isGuest = Boolean(user && !user.username);

    return (
        <AuthContext.Provider value={{ user, isGuest, justLoggedOut, consumeJustLoggedOut: () => setJustLoggedOut(false), register, continueAsGuest, claimAccount, login, demoLogin, mergeGuestLogin, updateProfile, deleteAccount, logout, verifyRestore, verifyEmailChange }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
