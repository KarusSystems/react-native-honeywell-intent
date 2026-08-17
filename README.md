# react-native-honeywell-intent

Honeywell barcode scanning for React Native and Expo, over Honeywell's **Data
Collection Intent API** — claim the scanner, configure symbologies, and receive
decoded barcodes entirely through Android broadcasts.

**No `DataCollection.jar`. No `DataCollection.aar`. No vendored binary.**

That is the point of this library. Every other React Native Honeywell package
commits Honeywell's Mobility SDK binary — distributed only through their
auth-walled support portal — into its own repo, which raises a redistribution
question and forces consumers to carry a binary they cannot audit or update.
The Intent API needs no dependency at all, so this installs and autolinks like
any other package.

> **Hardware-verified** on a Honeywell CK65 (Android 8.1, Data Collection
> Service 1.95.00.0039): claim, release, decoder configuration, check digit
> transmission, trigger disable and barcode delivery all exercised on the
> device. Every property key is checked against the string table of the
> device's own `DataCollectionService.apk` rather than inferred — see
> [`ClaimRequest.kt`](android/src/main/java/com/honeywellintent/ClaimRequest.kt)
> for the command to re-verify against other firmware.

## Install

```sh
npm install @karus-systems/react-native-honeywell-intent
```

Android only. Autolinks on React Native 0.60+.

## Usage

```tsx
import { useHoneywellScanner } from '@karus-systems/react-native-honeywell-intent';

function ScanScreen() {
  const { scannerState, isScannerReady, diagnostics } = useHoneywellScanner({
    onBarcode: (event) => console.log(event.data, event.labelType),
  });

  return <Text>{scannerState}</Text>;
}
```

The hook claims the scanner on mount, re-claims it when the app returns to the
foreground, and releases it on unmount.

### Stopping the scanner

Three different things are easy to confuse, and only one of them actually stops
the reader:

| Call | Effect |
| --- | --- |
| `stopReading()` | Disables the trigger, **keeps the claim**. The scanner genuinely stops. |
| `releaseReader()` | Hands the reader back. The beam fires again under the device default. |
| backgrounding | Releases automatically, re-claims on resume. Handled for you. |

`releaseReader()` is not a way to stop scanning. A released reader reverts to the
device default — typically Scan Wedge — so the trigger still fires and decoded
text can land in whatever field has focus. Use `stopReading()` for a screen where
a stray scan would be destructive, and `releaseReader()` only when you are done
with the scanner entirely.

## Configuration

### Expo

Add the config plugin. It writes the Android resources at prebuild and adds the
`<queries>` entries diagnostics needs on Android 11+.

```json
{
  "plugins": [
    [
      "@karus-systems/react-native-honeywell-intent",
      {
        "scanAction": "com.yourapp.SCAN",
        "scanner": "dcs.scanner.imager",
        "profile": "DEFAULT",
        "decoders": ["code128", "qrcode", "ean13"]
      }
    ]
  ]
}
```

### Bare React Native

Write the same values yourself in `android/app/src/main/res/values/honeywell_intent.xml`
— see [the bare example](example-bare/android/app/src/main/res/values/honeywell_intent.xml).
All values are optional; omit the file and the library defaults apply.

| Option | Default | Notes |
| --- | --- | --- |
| `scanAction` | `<applicationId>.SCAN` | Action decoded barcodes are broadcast to |
| `scanner` | `dcs.scanner.imager` | Or `dcs.scanner.ring` for a Bluetooth ring scanner |
| `profile` | `DEFAULT` | Named EZConfig profiles only |
| `decoders` | `["code128"]` | Symbologies to enable; all others are explicitly disabled |

### Symbologies

Every symbology below is written on every claim — the ones you list as enabled,
the rest as disabled. That matters when more than one app uses the scanner on a
device: a Honeywell claim inherits whatever the previous claimant configured, so
anything left unwritten would carry one app's settings into the next. Listing
`decoders` therefore sets the reader's full state rather than adding to it.

| Group | Values |
| --- | --- |
| Linear | `code128` `gs1-128` `code39` `code93` `code11` `codabar` `msi` `telepen` `trioptic` `tlc39` |
| Retail | `ean8` `ean13` `upca` `upce` `upce1` |
| 2 of 5 | `i2of5` `matrix-25` `standard-25` `iata-25` `hk-25` |
| GS1 DataBar | `databar-14` `databar-expanded` `databar-limited` `composite` |
| Stacked | `pdf417` `micropdf417` `codablock-a` `codablock-f` |
| 2D | `qrcode` `datamatrix` `aztec` `maxicode` `dotcode` `hanxin` `gridmatrix` `digimarc` `dpm` |
| Postal | `postal` `korea-post` |

Check digits are transmitted for EAN-8/13 and UPC-A/E. Decoder sub-options —
supplemental addenda, Code 39 full ASCII, Code 128 ISBT, video reverse — are
pinned off and are not currently configurable.

## API

| Export | Purpose |
| --- | --- |
| `useHoneywellScanner(options)` | Hook: claim lifecycle, barcode delivery, diagnostics |
| `claimScanner()` | Claim the reader and apply the configured decoders |
| `releaseScanner()` | Release the reader |
| `setScannerClaimed(claimed)` | Claim or release, whichever matches |
| `setTriggerEnabled(enabled)` | Make the trigger inert while keeping the claim |
| `triggerSoftScan(start)` | Start/stop the beam without the hardware trigger |
| `getDiagnostics()` | Device and claim state snapshot |
| `openScannerSettings()` | Deep-link to the Data Collection Service's settings |
| `addBarcodeListener(fn)` | Raw barcode events |
| `addClaimStateListener(fn)` | Claim taken/lost, including on backgrounding |

## Relationship to the Zebra sibling

This library deliberately mirrors
[`@karus-systems/react-native-zebra-datawedge`](https://github.com/KarusSystems/react-native-zebra-datawedge)
so a codebase can support both fleets with one shape. Two differences are real
and worth understanding rather than papering over:

**Claim is a session, not a profile.** A DataWedge profile is written once and
persists on the device across reboots. A Honeywell claim is held by one app at a
time. That is why the entry point is `claimScanner()` and not `configureProfile()`
— calling it once at startup and assuming the device stays configured is the
single most common way to end up with a scanner that mysteriously stops working.

Note the Data Collection Service does **not** revoke a claim when the holding app
backgrounds — verified on a CK65, where a backgrounded app holding a claim with
its trigger disabled left the reader dead for the entire device. This library
therefore releases on pause itself and re-claims on resume, so a backgrounded app
never keeps the scanner from the rest of the device. `addClaimStateListener`
reports both transitions.

**Diagnostics are thinner.** DataWedge is a separate installable app that answers
questions about itself — is it enabled, does the profile exist, what version. The
Data Collection Service is firmware and answers nothing over the intent API. So
`Diagnostics` here carries device facts and claim state only, all synchronous.
There is no timeout, no "unknown" state, and correspondingly less to reconcile.

## Alternatives and when to use them

Honeywell exposes three scanning surfaces, in increasing order of capability:

1. **Scan Wedge** — keyboard wedge. Types decoded text into the focused field.
   Needs no code at all. If that is genuinely all you need, turn it on in the
   device settings and do not install this library.
2. **Data Collection Intent API** — what this library wraps. Real barcode events,
   symbology configuration, soft trigger, claim lifecycle. No dependency.
3. **Mobility SDK** (`com.honeywell.aidc`) — full `BarcodeReaderProperties`
   access and reader introspection, at the cost of a portal-gated binary. If you
   need properties this library cannot reach, that is the escape hatch — see
   [`react-native-honeywell`](https://www.npmjs.com/package/react-native-honeywell).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
