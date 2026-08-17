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
  setScannerClaimed(claimed: boolean): Promise<boolean>;
  setTriggerEnabled(enabled: boolean): Promise<boolean>;
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

/**
 * Claim or release, whichever matches `claimed`.
 *
 * Named for the claim rather than for "enabled" because it does not enable
 * anything: a released scanner still fires its beam under the device default.
 * {@link setTriggerEnabled} is the one that stops the reader.
 */
export function setScannerClaimed(claimed: boolean): Promise<boolean> {
  return native.setScannerClaimed(claimed);
}

export function triggerSoftScan(start: boolean): Promise<boolean> {
  return native.triggerSoftScan(start);
}

/**
 * Make the hardware trigger inert, or live again, while keeping the claim.
 *
 * Not the same as {@link releaseScanner}. Releasing means "this app has stopped
 * listening": the reader reverts to the device default, so the beam still fires
 * on a trigger pull and decoded data can still land in whatever has focus.
 * This means "the scanner does nothing" — use it where a stray scan would be
 * destructive, such as a modal or a form mid-submit.
 *
 * Disabling requires holding the reader, so this claims it if not already
 * claimed, and the disable lasts exactly as long as that claim. Calling
 * {@link releaseScanner} lifts it — the device default resumes and its trigger
 * fires — so a screen that must not scan should stay claimed rather than
 * release. Backgrounding is safe: the claim is retaken on resume with the
 * disable still applied.
 */
export function setTriggerEnabled(enabled: boolean): Promise<boolean> {
  return native.setTriggerEnabled(enabled);
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
