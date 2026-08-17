import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The decoder list exists in three places that cannot import each other: the
 * Kotlin map that owns the firmware property names, the library's public
 * `BarcodeDecoder` union, and the config plugin's copy of that union. Nothing in
 * the type system connects them, so drift is silent — and silence is the whole
 * failure mode of this API. The firmware ignores property keys it does not
 * recognise rather than rejecting them, so a name that exists in one list and
 * not another produces a symbology that simply never decodes, with no error
 * anywhere.
 *
 * These tests read the three sources as text and compare them, which is crude
 * but is the only thing that can see across a Kotlin/TypeScript boundary.
 */

const ROOT = path.join(__dirname, '..', '..');

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Pull the quoted keys out of a Kotlin `mapOf("name" to "KEY", ...)` block. */
function kotlinMapEntries(source: string, mapName: string) {
  const block = source.match(
    new RegExp(`val ${mapName} = mapOf\\(([\\s\\S]*?)\\n  \\)`)
  );
  if (!block) throw new Error(`could not find ${mapName} in ClaimRequest.kt`);
  return [...block[1]!.matchAll(/"([^"]+)"\s+to\s+"([^"]+)"/g)].map((m) => ({
    name: m[1]!,
    key: m[2]!,
  }));
}

/** Pull the quoted entries out of a Kotlin `listOf("A", "B")` block. */
function kotlinListEntries(source: string, listName: string) {
  const block = source.match(
    new RegExp(`val ${listName} = listOf\\(([\\s\\S]*?)\\n  \\)`)
  );
  if (!block) throw new Error(`could not find ${listName} in ClaimRequest.kt`);
  return [...block[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

/** Pull the members out of a TypeScript string-literal union. */
function unionMembers(source: string, typeName: string) {
  const block = source.match(
    new RegExp(`export type ${typeName} =([\\s\\S]*?);`)
  );
  if (!block) throw new Error(`could not find type ${typeName}`);
  return [...block[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

const kotlin = read(
  'android/src/main/java/com/honeywellintent/ClaimRequest.kt'
);
const decoderKey = kotlinMapEntries(kotlin, 'DECODER_KEY');
const decoderNames = decoderKey.map((e) => e.name);

describe('decoder list stays in sync across Kotlin and TypeScript', () => {
  it('exposes the same names in the public type as the native map', () => {
    const publicUnion = unionMembers(read('src/types.ts'), 'BarcodeDecoder');
    expect([...publicUnion].sort()).toEqual([...decoderNames].sort());
  });

  it('exposes the same names in the config plugin as the native map', () => {
    const pluginUnion = unionMembers(
      read('plugin/src/withHoneywellIntent.ts'),
      'BarcodeDecoder'
    );
    expect([...pluginUnion].sort()).toEqual([...decoderNames].sort());
  });
});

describe('decoder map is internally coherent', () => {
  it('maps every public name to a distinct firmware key', () => {
    const keys = decoderKey.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not offer a name twice', () => {
    expect(new Set(decoderNames).size).toBe(decoderNames.length);
  });

  it('uses firmware property keys of the documented shape', () => {
    for (const { name, key } of decoderKey) {
      expect(`${name}: ${key}`).toMatch(/: DEC_[A-Z0-9_]+$/);
    }
  });

  /**
   * A key written as both a selectable decoder and a pinned sub-option would be
   * set twice in the same Bundle, and which value survives depends on iteration
   * order rather than intent.
   */
  it('never pins a sub-option that is also a selectable decoder', () => {
    const subOptions = kotlinListEntries(kotlin, 'SUB_OPTION_KEYS');
    const decoderKeys = new Set(decoderKey.map((e) => e.key));
    expect(subOptions.filter((k) => decoderKeys.has(k))).toEqual([]);
  });

  it('never pins a check digit key that is also a selectable decoder', () => {
    const checkDigits = kotlinListEntries(kotlin, 'CHECK_DIGIT_TRANSMIT_KEYS');
    const decoderKeys = new Set(decoderKey.map((e) => e.key));
    expect(checkDigits.filter((k) => decoderKeys.has(k))).toEqual([]);
  });
});
