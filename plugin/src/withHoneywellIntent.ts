import {
  withAndroidManifest,
  withDangerousMod,
  type ConfigPlugin,
} from '@expo/config-plugins';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Symbologies the Data Collection Service can decode. Kept in sync with the
 * `BarcodeDecoder` union in `src/types.ts` and the `DECODER_KEY` map in
 * `android/.../ClaimRequest.kt`, which is where the firmware property names live.
 */
export type BarcodeDecoder =
  // Linear
  | 'code128'
  | 'gs1-128'
  | 'code39'
  | 'code93'
  | 'code11'
  | 'codabar'
  | 'msi'
  | 'telepen'
  | 'trioptic'
  | 'tlc39'
  // Retail
  | 'ean8'
  | 'ean13'
  | 'upca'
  | 'upce'
  | 'upce1'
  // 2 of 5 family
  | 'i2of5'
  | 'matrix-25'
  | 'standard-25'
  | 'iata-25'
  | 'hk-25'
  // GS1 DataBar
  | 'databar-14'
  | 'databar-expanded'
  | 'databar-limited'
  | 'composite'
  // Stacked linear
  | 'pdf417'
  | 'micropdf417'
  | 'codablock-a'
  | 'codablock-f'
  // 2D
  | 'qrcode'
  | 'datamatrix'
  | 'aztec'
  | 'maxicode'
  | 'dotcode'
  | 'hanxin'
  | 'gridmatrix'
  | 'digimarc'
  | 'dpm'
  // Postal
  | 'postal'
  | 'korea-post';

export type ScannerTarget = 'dcs.scanner.imager' | 'dcs.scanner.ring';

export type HoneywellIntentOptions = {
  /**
   * Action decoded barcodes are broadcast to. Defaults to
   * `<applicationId>.SCAN`, resolved natively at runtime.
   */
  scanAction?: string;
  /** Which reader to claim. Defaults to the built-in imager. */
  scanner?: ScannerTarget;
  /**
   * Honeywell scanner profile to claim against. `DEFAULT` unless the device has
   * been provisioned with named profiles via EZConfig.
   */
  profile?: string;
  decoders?: BarcodeDecoder[];
};

/**
 * Package visibility for the Data Collection Service.
 *
 * Scanning needs these. The claim/release/control broadcasts are addressed to
 * the DCS package, so the module must be able to see that package to name it —
 * without visibility they degrade to implicit broadcasts, which never reach
 * DCS's manifest-declared receiver on API 26+. Diagnostics and the deep-link to
 * scanner settings depend on the same lookup.
 */
const DCS_PACKAGES = [
  'com.intermec.datacollectionservice',
  'com.honeywell.datacollectionservice',
  'com.honeywell.dcs',
];

/**
 * Asking who handles the claim action is what keeps this working on devices
 * whose DCS ships under a package name not in [DCS_PACKAGES]; that list is only
 * the fallback for the same lookup.
 */
const CLAIM_ACTION = 'com.honeywell.aidc.action.ACTION_CLAIM_SCANNER';

type AndroidName = { $: { 'android:name': string } };
type QueryEntry = {
  package?: AndroidName[];
  intent?: Array<{ action?: AndroidName[] }>;
};

const withQueries: ConfigPlugin = (config) =>
  withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest as unknown as {
      queries?: QueryEntry[];
    };
    const queries = manifest.queries ?? [];

    const hasClaimIntent = queries.some((q) =>
      (q.intent ?? []).some((i) =>
        (i.action ?? []).some((a) => a.$?.['android:name'] === CLAIM_ACTION)
      )
    );
    if (!hasClaimIntent) {
      queries.push({
        intent: [{ action: [{ $: { 'android:name': CLAIM_ACTION } }] }],
      });
    }

    for (const name of DCS_PACKAGES) {
      const present = queries.some((q) =>
        (q.package ?? []).some((p) => p.$?.['android:name'] === name)
      );
      if (!present) {
        queries.push({ package: [{ $: { 'android:name': name } }] });
      }
    }
    manifest.queries = queries;
    return c;
  });

const withGeneratedResources: ConfigPlugin<HoneywellIntentOptions> = (
  config,
  opts
) =>
  withDangerousMod(config, [
    'android',
    async (c) => {
      const resDir = path.join(
        c.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'values'
      );
      fs.mkdirSync(resDir, { recursive: true });
      const file = path.join(resDir, 'honeywell_intent.xml');
      fs.writeFileSync(file, renderXml(opts), 'utf8');
      return c;
    },
  ]);

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderXml(opts: HoneywellIntentOptions): string {
  const scanAction = opts.scanAction ?? '';
  const scanner = opts.scanner ?? 'dcs.scanner.imager';
  const profile = opts.profile ?? 'DEFAULT';
  const decoders =
    opts.decoders && opts.decoders.length > 0 ? opts.decoders : ['code128'];

  const items = decoders
    .map((d) => `        <item>${escape(d)}</item>`)
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="hwi_scan_action" translatable="false">${escape(scanAction)}</string>
    <string name="hwi_scanner" translatable="false">${escape(scanner)}</string>
    <string name="hwi_profile" translatable="false">${escape(profile)}</string>
    <string-array name="hwi_enabled_decoders" translatable="false">
${items}
    </string-array>
</resources>
`;
}

const withHoneywellIntent: ConfigPlugin<HoneywellIntentOptions | void> = (
  config,
  opts
) => {
  const resolved: HoneywellIntentOptions = opts ?? {};
  config = withQueries(config);
  config = withGeneratedResources(config, resolved);
  return config;
};

export default withHoneywellIntent;
