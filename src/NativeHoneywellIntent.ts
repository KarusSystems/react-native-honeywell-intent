import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  type EmitterSubscription,
} from 'react-native';
import type { BarcodeEvent, ClaimStateEvent, Diagnostics } from './types';

const LINKING_ERROR =
  "The package '@karus-systems/react-native-honeywell-intent' doesn't seem to be linked. Make sure:\n\n" +
  '- You rebuilt the app after installing the package\n' +
  '- You are running on Android (this library is Android-only)\n';

type NativeSpec = {
  claimScanner(): Promise<boolean>;
  releaseScanner(): Promise<boolean>;
  getDiagnostics(): Promise<Diagnostics>;
  openScannerSettings(): Promise<boolean>;
  setScannerEnabled(enabled: boolean): Promise<boolean>;
  triggerSoftScan(start: boolean): Promise<boolean>;
};

const native: NativeSpec =
  Platform.OS === 'android' && NativeModules.HoneywellIntent
    ? NativeModules.HoneywellIntent
    : (new Proxy(
        {},
        {
          get() {
            throw new Error(LINKING_ERROR);
          },
        }
      ) as NativeSpec);

const emitter =
  Platform.OS === 'android' && NativeModules.HoneywellIntent
    ? new NativeEventEmitter(NativeModules.HoneywellIntent)
    : null;

/**
 * Claim the scanner and apply the configured decoders.
 *
 * Unlike the DataWedge sibling's `configureProfile`, this is not write-once
 * setup: the claim is a session the Data Collection Service revokes when the app
 * backgrounds. The native module re-claims on resume, so callers do not need to
 * — but they should not assume one call configures the device forever either.
 */
export function claimScanner(): Promise<boolean> {
  return native.claimScanner();
}

export function releaseScanner(): Promise<boolean> {
  return native.releaseScanner();
}

export function getDiagnostics(): Promise<Diagnostics> {
  return native.getDiagnostics();
}

export function openScannerSettings(): Promise<boolean> {
  return native.openScannerSettings();
}

export function setScannerEnabled(enabled: boolean): Promise<boolean> {
  return native.setScannerEnabled(enabled);
}

export function triggerSoftScan(start: boolean): Promise<boolean> {
  return native.triggerSoftScan(start);
}

export function addBarcodeListener(
  listener: (event: BarcodeEvent) => void
): EmitterSubscription {
  if (!emitter) {
    return { remove: () => {} } as EmitterSubscription;
  }
  return emitter.addListener('onBarcode', listener as (event: unknown) => void);
}

/**
 * Fires whenever the claim is taken or lost — including the involuntary loss
 * when the app is backgrounded, which has no equivalent on DataWedge.
 */
export function addClaimStateListener(
  listener: (event: ClaimStateEvent) => void
): EmitterSubscription {
  if (!emitter) {
    return { remove: () => {} } as EmitterSubscription;
  }
  return emitter.addListener(
    'onClaimStateChange',
    listener as (event: unknown) => void
  );
}
