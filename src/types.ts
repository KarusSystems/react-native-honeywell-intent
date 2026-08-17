export type BarcodeDecoder =
  | 'code128'
  | 'code39'
  | 'code93'
  | 'ean8'
  | 'ean13'
  | 'upca'
  | 'upce'
  | 'qrcode'
  | 'datamatrix'
  | 'pdf417'
  | 'aztec'
  | 'i2of5';

export type BarcodeEvent = {
  data: string;
  /** Honeywell's `codeId`, falling back to `aimId`. Null if neither was sent. */
  labelType: string | null;
  charset: string | null;
  timestamp: string | null;
};

/** Which physical reader to claim. */
export type ScannerTarget = 'dcs.scanner.imager' | 'dcs.scanner.ring';

/**
 * Why the claim state changed.
 *
 * `paused` and `resumed` are the ones worth handling: the Data Collection
 * Service revokes a claim when the app leaves the foreground, so a scanner that
 * worked before a task switch is dead until it is re-claimed.
 */
export type ClaimReason = 'claimed' | 'released' | 'paused' | 'resumed';

export type ClaimStateEvent = {
  claimed: boolean;
  reason: ClaimReason;
};

/**
 * What the scanner is actually doing, for UI that needs to say something
 * truthful. A single "ready" boolean conflates `stopped` with `claiming` and
 * makes a deliberately stopped scanner look like it is still starting up.
 */
export type ScannerState =
  | 'checking'
  | 'unavailable'
  | 'stopped'
  | 'claiming'
  | 'ready';

/**
 * Deliberately thinner than the DataWedge sibling's diagnostics, and entirely
 * synchronous.
 *
 * DataWedge is a separate installable app that answers questions about itself
 * (is it enabled, does the profile exist, what version). Honeywell's Data
 * Collection Service is firmware and answers nothing over the intent API, so
 * every field here is either a device fact or state the native module owns.
 * Nothing can time out, so — unlike the Zebra library — there is no "unknown"
 * variant to reconcile.
 */
export type Diagnostics = {
  /** Build.MANUFACTURER / BRAND names Honeywell or Intermec. */
  isHoneywellDevice: boolean;
  manufacturer: string;
  model: string;
  /**
   * Whether a known Data Collection Service package was found. A best-effort
   * hint over a candidate list that may be incomplete — false here does NOT
   * mean scanning is unavailable, and `available` deliberately ignores it.
   */
  dataCollectionFound: boolean;
  dataCollectionPackage: string | null;
  dataCollectionVersion: string | null;
  /** The action decoded barcodes are broadcast to. */
  scanAction: string;
  scanner: ScannerTarget | string;
  profile: string;
  /** JS has asked to hold the scanner. Survives backgrounding. */
  claimRequested: boolean;
  /**
   * We believe we hold the scanner. Optimistic: the Intent API does not
   * acknowledge a claim, so this reflects "claim sent and not since revoked",
   * not a confirmation from the device.
   */
  claimed: boolean;
  /** Whether this device can scan at all. Currently just `isHoneywellDevice`. */
  available: boolean;
};
