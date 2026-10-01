import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';

// The iPhone's device id (iPhone app only; undefined on the web). The server records it when an
// account is deleted, so a new guest on that phone gets no free guest credits.
export async function getDeviceId() {
    if (!Capacitor.isNativePlatform()) return undefined;
    try {
        const { identifier } = await Device.getId();
        return identifier;
    } catch {
        return undefined;
    }
}
