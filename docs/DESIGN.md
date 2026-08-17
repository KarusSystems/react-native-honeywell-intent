# Honeywell scanning for React Native over the Data Collection Intent API

## Context

We ship [`@karus-systems/react-native-zebra-datawedge`](https://github.com/KarusSystems/react-native-zebra-datawedge):
a dependency-free Kotlin module that talks to Zebra's DataWedge over broadcast
intents, configured by build-time Android resources written either by an Expo
config plugin or by hand in bare RN. This library is its Honeywell sibling.

## Why the Intent API and not the Mobility SDK

Honeywell exposes three scanning surfaces, which their own documentation frames
as a ladder of sophistication rather than as successive generations:

1. **Scan Wedge** — keyboard wedge. No code, no events, no control. Routing is by
   focus, so there is no way to distinguish a scan from typing, no symbology, and
   no enable/disable. Not a viable base for a library whose value is lifecycle
   handling and diagnostics.
2. **Data Collection Intent API** — broadcasts. `ACTION_CLAIM_SCANNER` with an
   `EXTRA_PROPERTIES` bundle, `ACTION_RELEASE_SCANNER`, `ACTION_CONTROL_SCANNER`,
   and decoded barcodes delivered to an action of our choosing via the
   `DPR_DATA_INTENT_ACTION` property. No dependency.
3. **Mobility SDK** (`com.honeywell.aidc`) — `AidcManager`, `BarcodeReader`, full
   `BarcodeReaderProperties`. Distributed only through Honeywell's auth-walled
   support portal.

We chose (2).

The deciding factor is distribution, not capability. The SDK's AAR/JAR cannot be
fetched from Maven Central, so a library that uses it must either commit
Honeywell's binary into its own repo — which is what all six existing React
Native packages do, and which raises an unresolved redistribution-licence
question — or make consumers hand-copy a folder into `android/libs`, which is
what the main Flutter package does. Both break the plain-`npm install` promise
the Zebra sibling is built around.

Surveyed 2026-08-07: every Honeywell package on npm (`react-native-honeywell`,
`@ashish293/…`, `@angelcat/…`, `@nextup/…`, `react-native-honeywell-scanner-trigger`,
`react-native-honeywell-barcode-reader`) bundles `DataCollection.jar` or `.aar`
and calls `AidcManager`. **Not one uses the Intent API.** Intent-based
implementations exist in every other ecosystem — Cordova, Capacitor, Flutter
([`Rokke/scanwedge`](https://github.com/Rokke/scanwedge)), plain Android
([`enioka_scan`](https://github.com/enioka-Haute-Couture/enioka_scan),
[`pretix/libpretixui-android`](https://github.com/pretix/libpretixui-android)) —
just not this one. That gap, not the age of the alternatives, is the pitch.

If a consumer eventually needs reader properties the Intent API cannot reach, the
escape hatch is an SDK-backed backend behind the same interface — deliberately
deferred until someone actually asks, rather than paid for up front.

## Architecture

Mirrors the Zebra sibling exactly: classic `ReactContextBaseJavaModule` in
Kotlin, `NativeModules` + `NativeEventEmitter` on the JS side, no
`expo-modules-core` requirement, an Expo config plugin for prebuild, and two
example apps (Expo and bare RN) over a shared UI workspace.

```
android/src/main/java/com/honeywellintent/
├── HoneywellIntentModule.kt   # claim lifecycle, broadcasts, events
├── HoneywellIntentPackage.kt
└── ClaimRequest.kt            # intent constants + EXTRA_PROPERTIES builder
plugin/src/withHoneywellIntent.ts
src/{types,NativeHoneywellIntent,scannerState,useHoneywellScanner}.ts
```

## Where it deliberately diverges from the Zebra library

### Claim is a session, not a profile

A DataWedge profile is written once with `SET_CONFIG` and persists on the device
across reboots, which is why `configureProfile()` there is idempotent and
fire-on-mount. The Data Collection Service instead grants the reader to one app
at a time and revokes it when that app leaves the foreground.

Consequences:

- The entry point is `claimScanner()`, not `configureProfile()`. Naming it after
  the Zebra method would hide the single most important behavioural difference
  from anyone porting between the two.
- `onHostResume` re-claims; `onHostPause` marks the claim lost. Without this the
  scanner is silently dead after the first task switch.
- A new `onClaimStateChange` event reports both, including the involuntary loss.
  There is no DataWedge equivalent.
- Every symbology is written explicitly on each claim, enabled and disabled
  alike — a claim inherits whatever the previous claimant configured, so omitting
  a decoder means "keep the last app's setting", not "off".

### Readiness is optimistic, not confirmed

DataWedge answers `SCANNER_INPUT_PLUGIN` on `RESULT_ACTION` whether or not the
state actually changed, which makes it an authoritative readiness signal — the
Zebra library leans on it heavily. The Intent API acknowledges nothing. So
`claimed` means "claim broadcast sent and not since revoked", and the only real
proof the reader is ours is a barcode arriving. This is documented on the type
and surfaced in the diagnostics screen rather than hidden behind a boolean that
implies more certainty than we have.

### Diagnostics are thinner and synchronous

Zebra's diagnostics interrogate DataWedge as a separate installable app:
`installed`, `packageEnabled`, `serviceEnabled` via `GET_DATAWEDGE_STATUS`,
`profileExists` via `GET_PROFILES_LIST`, plus a version. All of that is a
broadcast round-trip that can time out, which is why that library needs
`serviceStatusKnown`, a retry, and `reconcileDiagnostics`.

DCS is firmware and exposes no query surface, so every field here is either a
`PackageManager` fact or state the module already owns. Nothing can time out;
there is no unknown state and nothing to reconcile.

One judgement call worth recording: the module probes a candidate list of DCS
package names (`com.intermec.datacollectionservice` and friends) for the version
row and the settings deep link, but `available` deliberately ignores the result.
The list is known-incomplete across Honeywell's Intermec-era and current device
lines, and gating on it would report a working CT60 as having no scanner because
its DCS lives under a name nobody wrote down. A miss is reported for a human to
interpret, never used to block the feature.

## Known unverified areas

Written without hardware; a device is expected 2026-08-14.

- **Symbology property keys.** `DEC_<symbology>_ENABLED` is the right shape, but
  Honeywell has spelled individual entries inconsistently across SDK versions
  (`DEC_UPCA_ENABLE`, `DEC_UPCE0_ENABLED`). Unrecognised keys are ignored rather
  than rejected, so a wrong entry disables one symbology *silently*. They are
  isolated in a single map in `ClaimRequest.kt` for this reason.
- **DCS package names.** Best-effort list; see above for why nothing depends on it.
- **Whether `ACTION_CONTROL_SCANNER` requires an active claim** — assumed yes,
  documented as such in the example app.
- **Whether the claim survives a screen-off**, as distinct from a task switch.
