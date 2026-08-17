import {
  withAndroidManifest,
  withDangerousMod,
  type ConfigPlugin,
} from '@expo/config-plugins';
import fs from 'node:fs';
import path from 'node:path';

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
 * Scanning does not need these — claim/release/control broadcasts go to our own
 * package. They exist so diagnostics can identify and version the DCS package,
 * and so the troubleshooting screen can deep-link to its settings.
 */
const DCS_PACKAGES = [
  'com.intermec.datacollectionservice',
  'com.honeywell.datacollectionservice',
  'com.honeywell.dcs',
];

const withQueries: ConfigPlugin = (config) =>
  withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest as unknown as {
      queries?: Array<{ package?: Array<{ $: { 'android:name': string } }> }>;
    };
    const queries = manifest.queries ?? [];
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
