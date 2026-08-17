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
   * UNVERIFIED ON HARDWARE. The shape of these keys is right, but Honeywell has
   * spelled individual entries inconsistently across SDK versions (`DEC_UPCA_ENABLE`
   * without the D, `DEC_UPCE0_ENABLED` with the zero). Keys the firmware does not
   * recognise are ignored rather than rejected, so a wrong entry disables one
   * symbology silently — check every decoder you rely on against a real device
   * before shipping, and fix them here. This map is the only place they appear.
   */
  private val DECODER_KEY = mapOf(
    "code128" to "DEC_CODE128_ENABLED",
    "code39" to "DEC_CODE39_ENABLED",
    "code93" to "DEC_CODE93_ENABLED",
    "ean8" to "DEC_EAN8_ENABLED",
    "ean13" to "DEC_EAN13_ENABLED",
    "upca" to "DEC_UPCA_ENABLE",
    "upce" to "DEC_UPCE0_ENABLED",
    "qrcode" to "DEC_QR_ENABLED",
    "datamatrix" to "DEC_DATAMATRIX_ENABLED",
    "pdf417" to "DEC_PDF417_ENABLED",
    "aztec" to "DEC_AZTEC_ENABLED",
    "i2of5" to "DEC_I25_ENABLED"
  )

  /**
   * Build the `EXTRA_PROPERTIES` bundle sent with a claim.
   *
   * Every known symbology is written explicitly — enabled ones true, the rest
   * false — rather than only the enabled ones. A claim inherits whatever the
   * previous claimant left configured, so omitting a decoder means "keep the last
   * app's setting", not "off".
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
    }
  }
}
