package com.honeywellintent

import android.os.Bundle

/**
 * Constants and bundle construction for Honeywell's Data Collection Intent API.
 *
 * This is the intent surface of the Data Collection Service — the middle rung of
 * Honeywell's three (Scan Wedge < Intent API < Mobility SDK). It needs no
 * `DataCollection.aar`, which is the whole reason this library exists.
 *
 * Names verified against Honeywell's Data Collection Intent API guide and
 * enioka_scan's HoneywellIntents.java. The DEC_* symbology keys in [DECODER_KEY]
 * are the least certain part of this file — see the note there.
 */
internal object HoneywellIntents {
  const val ACTION_CLAIM_SCANNER = "com.honeywell.aidc.action.ACTION_CLAIM_SCANNER"
  const val ACTION_RELEASE_SCANNER = "com.honeywell.aidc.action.ACTION_RELEASE_SCANNER"
  const val ACTION_CONTROL_SCANNER = "com.honeywell.aidc.action.ACTION_CONTROL_SCANNER"

  const val EXTRA_SCANNER = "com.honeywell.aidc.extra.EXTRA_SCANNER"
  const val EXTRA_PROFILE = "com.honeywell.aidc.extra.EXTRA_PROFILE"
  const val EXTRA_PROPERTIES = "com.honeywell.aidc.extra.EXTRA_PROPERTIES"
  const val EXTRA_SCAN = "com.honeywell.aidc.extra.EXTRA_SCAN"

  const val SCANNER_IMAGER = "dcs.scanner.imager"
  const val SCANNER_RING = "dcs.scanner.ring"
  const val PROFILE_DEFAULT = "DEFAULT"

  /**
   * These two are what make the Intent API a real alternative to the SDK: they
   * tell the Data Collection Service to broadcast decoded barcodes to an action
   * we choose, which is the direct analogue of DataWedge's `intent_action`.
   */
  const val PROPERTY_DATA_INTENT = "DPR_DATA_INTENT"
  const val PROPERTY_DATA_INTENT_ACTION = "DPR_DATA_INTENT_ACTION"

  /** Extras on the barcode broadcast. */
  const val EXTRA_DATA = "data"
  const val EXTRA_CODE_ID = "codeId"
  const val EXTRA_AIM_ID = "aimId"
  const val EXTRA_CHARSET = "charset"
  const val EXTRA_TIMESTAMP = "timestamp"

  /**
   * Candidate package names for the Data Collection Service. Unlike DataWedge —
   * a normal installable app with a stable package name — DCS is firmware, and
   * which package hosts it has varied across Honeywell's Intermec-era and
   * current device lines. Diagnostics probes each and reports the first hit;
   * absence of all of them is not proof the Intent API is unavailable, which is
   * why [HoneywellIntentModule] never gates on it.
   */
  val DCS_PACKAGE_CANDIDATES = listOf(
    "com.intermec.datacollectionservice",
    "com.honeywell.datacollectionservice",
    "com.honeywell.dcs"
  )
}

internal object ClaimRequest {
  /**
   * Symbology property keys, in Honeywell's `DEC_<symbology>_ENABLED` form.
   *
   * VERIFIED against the Data Collection Service firmware on a CK65 (Android
   * 8.1, DCS 1.95.00.0039): every key below appears verbatim in the string table
   * of `/vendor/app/DataCollectionService/DataCollectionService.apk`. That includes
   * the two inconsistent ones — `DEC_UPCA_ENABLE` really does lack the D, and
   * `DEC_UPCE0_ENABLED` really does carry the zero.
   *
   * Re-verify the same way rather than by trial and error, because the firmware
   * ignores keys it does not recognise instead of rejecting them, so a wrong
   * entry disables one symbology in total silence:
   *
   *     adb exec-out cat /vendor/app/DataCollectionService/DataCollectionService.apk > dcs.apk
   *     unzip -p dcs.apk classes.dex | strings -a | grep -oE '^DEC_[A-Z0-9_]+$' | sort -u
   */
  private val DECODER_KEY = mapOf(
    // Linear
    "code128" to "DEC_CODE128_ENABLED",
    "gs1-128" to "DEC_GS1_128_ENABLED",
    "code39" to "DEC_CODE39_ENABLED",
    "code93" to "DEC_CODE93_ENABLED",
    "code11" to "DEC_CODE11_ENABLED",
    "codabar" to "DEC_CODABAR_ENABLED",
    "msi" to "DEC_MSI_ENABLED",
    "telepen" to "DEC_TELEPEN_ENABLED",
    "trioptic" to "DEC_TRIOPTIC_ENABLED",
    "tlc39" to "DEC_TLC39_ENABLED",
    // Retail
    "ean8" to "DEC_EAN8_ENABLED",
    "ean13" to "DEC_EAN13_ENABLED",
    "upca" to "DEC_UPCA_ENABLE",
    "upce" to "DEC_UPCE0_ENABLED",
    "upce1" to "DEC_UPCE1_ENABLED",
    // 2 of 5 family
    "i2of5" to "DEC_I25_ENABLED",
    "matrix-25" to "DEC_M25_ENABLED",
    "standard-25" to "DEC_S25_ENABLED",
    "iata-25" to "DEC_IATA25_ENABLED",
    "hk-25" to "DEC_HK25_ENABLED",
    // GS1 DataBar — "RSS" is the pre-2007 name the firmware still uses
    "databar-14" to "DEC_RSS_14_ENABLED",
    "databar-expanded" to "DEC_RSS_EXPANDED_ENABLED",
    "databar-limited" to "DEC_RSS_LIMITED_ENABLED",
    "composite" to "DEC_COMPOSITE_ENABLED",
    // Stacked linear
    "pdf417" to "DEC_PDF417_ENABLED",
    "micropdf417" to "DEC_MICROPDF_ENABLED",
    "codablock-a" to "DEC_CODABLOCK_A_ENABLED",
    "codablock-f" to "DEC_CODABLOCK_F_ENABLED",
    // 2D
    "qrcode" to "DEC_QR_ENABLED",
    "datamatrix" to "DEC_DATAMATRIX_ENABLED",
    "aztec" to "DEC_AZTEC_ENABLED",
    "maxicode" to "DEC_MAXICODE_ENABLED",
    "dotcode" to "DEC_DOTCODE_ENABLED",
    "hanxin" to "DEC_HANXIN_ENABLED",
    "gridmatrix" to "DEC_GRIDMATRIX_ENABLED",
    "digimarc" to "DEC_DIGIMARC_ENABLED",
    "dpm" to "DEC_DPM_ENABLED",
    // Postal
    "postal" to "DEC_POSTAL_ENABLED",
    "korea-post" to "DEC_KOREA_POST_ENABLED"
  )

  /**
   * Decoder sub-options, pinned off.
   *
   * These are not symbologies — they modify how one is decoded (supplemental
   * addenda, Code 39 full-ASCII, Code 128 ISBT concatenation, white-on-black
   * video reverse). They are listed separately so they are not offered as
   * "decoders" callers can enable, but they must still be written on every
   * claim: leaving them out is exactly the inheritance hole that
   * [buildProperties] exists to close, and an addenda flag left on by another
   * app silently changes the payload this one receives.
   *
   * Off matches Honeywell's own defaults for all fourteen. Exposing any of them
   * as configuration is a separate change; pinning them is what makes a claim
   * mean the same thing on every device today.
   */
  private val SUB_OPTION_KEYS = listOf(
    "DEC_EAN13_2CHAR_ADDENDA_ENABLED",
    "DEC_EAN13_5CHAR_ADDENDA_ENABLED",
    "DEC_EAN8_2CHAR_ADDENDA_ENABLED",
    "DEC_EAN8_5CHAR_ADDENDA_ENABLED",
    "DEC_UPCA_2CHAR_ADDENDA_ENABLED",
    "DEC_UPCA_5CHAR_ADDENDA_ENABLED",
    "DEC_UPCE_2CHAR_ADDENDA_ENABLED",
    "DEC_UPCE_5CHAR_ADDENDA_ENABLED",
    "DEC_COMPOSITE_WITH_UPC_ENABLED",
    "DEC_CODE39_FULL_ASCII_ENABLED",
    "DEC_CODE39_BASE32_ENABLED",
    "DEC_C128_ISBT_ENABLED",
    "DEC_CODABAR_CONCAT_ENABLED",
    "DEC_VIDEO_REVERSE_ENABLED"
  )

  /**
   * Check digit transmission, for the symbologies that can withhold it.
   *
   * These are separate properties from the `DEC_*_ENABLED` keys and default to
   * off in at least some profiles, which truncates a 13-digit EAN-13 to the 12
   * digits before its check digit. The result still looks like a plausible
   * barcode, so the loss is easy to miss and impossible to recover downstream —
   * the check digit is not derivable from a payload you cannot trust is intact.
   *
   * Note these keys end in `_TRANSMIT`, not `_TRANSMIT_ENABLED` like the pattern
   * elsewhere would suggest. Verified the same way as [DECODER_KEY].
   */
  private val CHECK_DIGIT_TRANSMIT_KEYS = listOf(
    "DEC_EAN13_CHECK_DIGIT_TRANSMIT",
    "DEC_EAN8_CHECK_DIGIT_TRANSMIT",
    "DEC_UPCA_CHECK_DIGIT_TRANSMIT",
    "DEC_UPCE_CHECK_DIGIT_TRANSMIT"
  )

  /**
   * Build the `EXTRA_PROPERTIES` bundle sent with a claim.
   *
   * Every decode property the firmware exposes is written on every claim —
   * requested symbologies true, everything else false — rather than only the
   * enabled ones. A claim inherits whatever the previous claimant left
   * configured, so an omitted key means "keep the last app's setting", not
   * "off".
   *
   * That matters most when several apps share one device, which is the normal
   * case for this library: each app claims the same reader in turn, and any key
   * left unwritten carries the previous app's intent into this one. The symptom
   * is a symbology that decodes on one handset and not another, with identical
   * builds and nothing in the code to explain it. Writing the full set is what
   * makes a claim authoritative rather than a diff against unknown state.
   */
  fun buildProperties(
    scanAction: String,
    decoders: List<String>
  ): Bundle {
    val enabled = decoders.mapNotNull { DECODER_KEY[it.lowercase()] }.toSet()
    return Bundle().apply {
      putBoolean(HoneywellIntents.PROPERTY_DATA_INTENT, true)
      putString(HoneywellIntents.PROPERTY_DATA_INTENT_ACTION, scanAction)
      DECODER_KEY.values.forEach { key -> putBoolean(key, key in enabled) }
      SUB_OPTION_KEYS.forEach { key -> putBoolean(key, false) }
      CHECK_DIGIT_TRANSMIT_KEYS.forEach { key -> putBoolean(key, true) }
    }
  }
}
