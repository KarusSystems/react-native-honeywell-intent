package com.honeywellintent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Honeywell scanning over the Data Collection Intent API.
 *
 * The important difference from the Zebra/DataWedge sibling: a DataWedge profile
 * is written once and persists on the device, so `configureProfile` is idempotent
 * and fire-and-forget. A Honeywell claim is a *session* — the Data Collection
 * Service hands the reader to one app at a time and takes it back when that app
 * stops. So this module claims on resume and releases on pause, and tells JS
 * about it, rather than assuming configuration survives backgrounding.
 */
class HoneywellIntentModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

  override fun getName(): String = NAME

  private val scanAction: String by lazy {
    val v = resString("hwi_scan_action", "")
    if (v.isNotEmpty()) v else "${reactContext.packageName}.SCAN"
  }
  private val scanner: String by lazy {
    resString("hwi_scanner", HoneywellIntents.SCANNER_IMAGER)
  }
  private val profile: String by lazy {
    resString("hwi_profile", HoneywellIntents.PROFILE_DEFAULT)
  }
  private val decoders: List<String> by lazy {
    resStringArray("hwi_enabled_decoders", listOf("code128"))
  }

  /** Whether JS has asked us to hold the scanner. Survives pause/resume. */
  @Volatile private var claimRequested: Boolean = false

  /** Whether we believe we currently hold it. */
  @Volatile private var claimed: Boolean = false

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == scanAction) handleScan(intent)
    }
  }

  init {
    reactContext.addLifecycleEventListener(this)
    registerReceiver()
  }

  private fun registerReceiver() {
    val filter = IntentFilter().apply {
      addAction(scanAction)
      addCategory(Intent.CATEGORY_DEFAULT)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      reactContext.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      reactContext.registerReceiver(receiver, filter)
    }
  }

  // ---- lifecycle ----
  //
  // The Data Collection Service revokes a claim when the claiming app leaves the
  // foreground. Re-claiming on resume is not an optimisation; without it the
  // scanner is silently dead after the first time the user switches apps.

  override fun onHostResume() {
    if (claimRequested && !claimed) sendClaim()
  }

  override fun onHostPause() {
    if (claimed) {
      claimed = false
      emitClaimState(false, "paused")
    }
  }

  override fun onHostDestroy() {
    if (claimRequested) sendRelease()
    try {
      reactContext.unregisterReceiver(receiver)
    } catch (_: IllegalArgumentException) {
    }
  }

  // ---- public API ----

  /**
   * Claim the scanner and configure it in one broadcast.
   *
   * Named for what it does rather than mirroring the sibling library's
   * `configureProfile`: there is no persistent profile here, and treating this
   * as write-once configuration is precisely the mistake that leaves the scanner
   * dead after the app is backgrounded.
   */
  @ReactMethod
  fun claimScanner(promise: Promise) {
    try {
      claimRequested = true
      sendClaim()
      promise.resolve(true)
    } catch (t: Throwable) {
      claimRequested = false
      promise.reject("HWI_CLAIM_FAILED", t.message, t)
    }
  }

  @ReactMethod
  fun releaseScanner(promise: Promise) {
    try {
      claimRequested = false
      sendRelease()
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("HWI_RELEASE_FAILED", t.message, t)
    }
  }

  @ReactMethod
  fun setScannerEnabled(enabled: Boolean, promise: Promise) {
    if (enabled) claimScanner(promise) else releaseScanner(promise)
  }

  /**
   * Diagnostics are entirely synchronous here, unlike the DataWedge sibling.
   *
   * That library asks DataWedge — a separate, installable, interrogable app —
   * for its service status and profile list over a broadcast round-trip that can
   * time out. Honeywell's Data Collection Service is firmware with no query
   * surface on the intent API, so everything below is either a PackageManager
   * fact or state this module already owns. Nothing can time out, so there is no
   * "unknown" case and nothing to reconcile.
   */
  @ReactMethod
  fun getDiagnostics(promise: Promise) {
    val result = Arguments.createMap().apply {
      putBoolean("isHoneywellDevice", isHoneywellDevice())
      putString("manufacturer", Build.MANUFACTURER ?: "")
      putString("model", Build.MODEL ?: "")
      putString("scanAction", scanAction)
      putString("scanner", scanner)
      putString("profile", profile)
      putBoolean("claimRequested", claimRequested)
      putBoolean("claimed", claimed)
    }

    val dcsPackage = HoneywellIntents.DCS_PACKAGE_CANDIDATES.firstOrNull { packageExists(it) }
    if (dcsPackage == null) {
      result.putNull("dataCollectionPackage")
      result.putNull("dataCollectionVersion")
      result.putBoolean("dataCollectionFound", false)
    } else {
      result.putString("dataCollectionPackage", dcsPackage)
      val version = try {
        reactContext.packageManager.getPackageInfo(dcsPackage, 0).versionName
      } catch (_: PackageManager.NameNotFoundException) {
        null
      }
      if (version == null) result.putNull("dataCollectionVersion")
      else result.putString("dataCollectionVersion", version)
      result.putBoolean("dataCollectionFound", true)
    }

    // Deliberately not `dataCollectionFound && isHoneywellDevice`. The package
    // probe is a best-effort hint over a candidate list that may be incomplete,
    // so a miss must not be allowed to declare a working scanner unavailable.
    result.putBoolean("available", isHoneywellDevice())
    promise.resolve(result)
  }

  @ReactMethod
  fun triggerSoftScan(start: Boolean, promise: Promise) {
    try {
      val intent = Intent(HoneywellIntents.ACTION_CONTROL_SCANNER).apply {
        setPackage(reactContext.packageName)
        putExtra(HoneywellIntents.EXTRA_SCAN, start)
      }
      reactContext.sendBroadcast(intent)
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("HWI_SOFT_SCAN_FAILED", t.message, t)
    }
  }

  /**
   * Honeywell has no single "scanner app" to deep-link to the way DataWedge
   * does, so this opens the device's own settings for whichever package hosts
   * the Data Collection Service, and resolves false when none was found.
   */
  @ReactMethod
  fun openScannerSettings(promise: Promise) {
    try {
      val pkg = HoneywellIntents.DCS_PACKAGE_CANDIDATES.firstOrNull { packageExists(it) }
      if (pkg == null) {
        promise.resolve(false)
        return
      }
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:$pkg")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("HWI_OPEN_SETTINGS_FAILED", t.message, t)
    }
  }

  // RN 0.65+ NativeEventEmitter stubs — presence prevents warnings; no-op bodies.
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Double) {}

  // ---- helpers ----

  private fun sendClaim() {
    val intent = Intent(HoneywellIntents.ACTION_CLAIM_SCANNER).apply {
      setPackage(reactContext.packageName)
      putExtra(HoneywellIntents.EXTRA_SCANNER, scanner)
      putExtra(HoneywellIntents.EXTRA_PROFILE, profile)
      putExtra(
        HoneywellIntents.EXTRA_PROPERTIES,
        ClaimRequest.buildProperties(scanAction, decoders)
      )
    }
    reactContext.sendBroadcast(intent)
    // The Intent API does not acknowledge a claim, so this is an assumption, not
    // a confirmation. It is reported to JS as `claimed` with that caveat
    // documented; the only real proof the reader is ours is a barcode arriving.
    claimed = true
    emitClaimState(true, "claimed")
  }

  private fun sendRelease() {
    val intent = Intent(HoneywellIntents.ACTION_RELEASE_SCANNER).apply {
      setPackage(reactContext.packageName)
      putExtra(HoneywellIntents.EXTRA_SCANNER, scanner)
    }
    reactContext.sendBroadcast(intent)
    claimed = false
    emitClaimState(false, "released")
  }

  private fun handleScan(intent: Intent) {
    val data = intent.getStringExtra(HoneywellIntents.EXTRA_DATA) ?: return
    // codeId is Honeywell's single-character symbology id; aimId is the AIM
    // standard one. Prefer codeId to match what Honeywell's own docs show, and
    // fall back rather than reporting nothing.
    val labelType = intent.getStringExtra(HoneywellIntents.EXTRA_CODE_ID)
      ?: intent.getStringExtra(HoneywellIntents.EXTRA_AIM_ID)
    val event = Arguments.createMap().apply {
      putString("data", data)
      if (labelType == null) putNull("labelType") else putString("labelType", labelType)
      val charset = intent.getStringExtra(HoneywellIntents.EXTRA_CHARSET)
      if (charset == null) putNull("charset") else putString("charset", charset)
      val timestamp = intent.getStringExtra(HoneywellIntents.EXTRA_TIMESTAMP)
      if (timestamp == null) putNull("timestamp") else putString("timestamp", timestamp)
    }
    emitEvent("onBarcode", event)
  }

  private fun emitClaimState(isClaimed: Boolean, reason: String) {
    val event = Arguments.createMap().apply {
      putBoolean("claimed", isClaimed)
      putString("reason", reason)
    }
    emitEvent("onClaimStateChange", event)
  }

  private fun emitEvent(name: String, payload: WritableMap) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, payload)
  }

  private fun isHoneywellDevice(): Boolean {
    val fields = listOf(Build.MANUFACTURER, Build.BRAND).map { it?.lowercase() ?: "" }
    return fields.any { it.contains("honeywell") || it.contains("intermec") }
  }

  private fun packageExists(name: String): Boolean = try {
    reactContext.packageManager.getPackageInfo(name, 0)
    true
  } catch (_: PackageManager.NameNotFoundException) {
    false
  }

  private fun resString(name: String, fallback: String): String {
    val id = reactContext.resources.getIdentifier(name, "string", reactContext.packageName)
    return if (id != 0) reactContext.resources.getString(id) else fallback
  }

  private fun resStringArray(name: String, fallback: List<String>): List<String> {
    val id = reactContext.resources.getIdentifier(name, "array", reactContext.packageName)
    return if (id != 0) reactContext.resources.getStringArray(id).toList() else fallback
  }

  companion object {
    const val NAME = "HoneywellIntent"
  }
}
