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

  /**
   * Whether the hardware trigger should do anything. Survives pause/resume for
   * the same reason [claimRequested] does: the re-claim on resume rebuilds the
   * whole property bundle, so a disabled trigger that is not remembered here
   * would quietly re-enable itself the first time the user switches apps.
   */
  @Volatile private var triggerEnabled: Boolean = true

  /**
   * The package hosting the Data Collection Service's intent API receiver.
   *
   * Claim, release and control broadcasts must be addressed to *DCS*, which is a
   * different app. Addressing them to our own package — the obvious-looking
   * `setPackage(reactContext.packageName)` — restricts delivery to components
   * inside this app, where no such receiver exists, so every call silently
   * reaches nobody. The scanner then keeps working for whichever app or wedge
   * already holds it, which makes a delivery failure look like a decoder or
   * configuration problem.
   *
   * Asking the PackageManager which receiver actually handles the claim action
   * is the authoritative answer. [HoneywellIntents.DCS_PACKAGE_CANDIDATES] is a
   * fallback for when package-visibility filtering hides the query result.
   */
  private val dcsPackage: String? by lazy {
    reactContext.packageManager
      .queryBroadcastReceivers(Intent(HoneywellIntents.ACTION_CLAIM_SCANNER), 0)
      .firstOrNull()
      ?.activityInfo
      ?.packageName
      ?: HoneywellIntents.DCS_PACKAGE_CANDIDATES.firstOrNull { packageExists(it) }
  }

  /**
   * Build a Data Collection Intent API broadcast addressed to the service.
   *
   * When the package cannot be resolved the broadcast goes out implicitly rather
   * than not at all. That is a long shot on API 26+, where implicit broadcasts
   * do not reach manifest-declared receivers, but it is the only option left on
   * a device whose DCS package we cannot see, and it costs nothing to try.
   */
  private fun dcsIntent(action: String): Intent =
    Intent(action).apply { dcsPackage?.let { setPackage(it) } }

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
  // The Data Collection Service does NOT revoke a claim when the claiming app
  // leaves the foreground — verified on a CK65: background the app while holding
  // a claim with the trigger disabled and the reader stays dead for the whole
  // device, with no release logged by the service. So the release has to be sent
  // here, and the claim retaken on resume.
  //
  // Holding a claim in the background is antisocial even with the trigger live:
  // barcodes keep being broadcast to a backgrounded app's action, and on a
  // device where several apps share one reader that is somebody else's scans
  // going missing.

  override fun onHostResume() {
    if (claimRequested && !claimed) sendClaim()
  }

  override fun onHostPause() {
    if (claimed) {
      // Deliberately not [releaseScanner]: that resets [triggerEnabled] because
      // the caller has finished with the reader. Backgrounding is not finishing,
      // so the disable is kept and reapplied by the re-claim on resume — while
      // the actual release hands the reader back so the rest of the device works
      // normally in the meantime.
      broadcastRelease()
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

  /**
   * Release the scanner, lifting any trigger disable with it.
   *
   * A disabled trigger cannot outlive the claim: the Data Collection Service
   * hands the reader back to the device default, whose trigger works, and no
   * property we set survives that. Verified on a CK65 — disable the trigger,
   * release, and the beam fires again.
   *
   * So [triggerEnabled] is reset here rather than remembered. Keeping it false
   * would leave the module reporting a disabled trigger while the hardware
   * happily fires, and would silently re-disable on a later claim that the
   * caller never asked to be disabled. Note this is deliberately not done in
   * [onHostPause], which does not release: a disable *should* survive
   * backgrounding and be reapplied by the re-claim on resume.
   */
  @ReactMethod
  fun releaseScanner(promise: Promise) {
    try {
      claimRequested = false
      triggerEnabled = true
      sendRelease()
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("HWI_RELEASE_FAILED", t.message, t)
    }
  }

  /**
   * Claim or release, whichever matches [claimed].
   *
   * Not named `setScannerEnabled`: releasing does not disable anything, since
   * the reader reverts to the device default and keeps firing. [setTriggerEnabled]
   * is the one that stops it.
   */
  @ReactMethod
  fun setScannerClaimed(claimed: Boolean, promise: Promise) {
    if (claimed) claimScanner(promise) else releaseScanner(promise)
  }

  /**
   * Make the hardware trigger inert, or live again, without giving up the claim.
   *
   * This is the difference between "this app has stopped listening" and "the
   * scanner does nothing". [releaseScanner] does the former: the reader goes
   * back to the device default, so the beam still fires on a trigger pull and
   * decoded data can still reach whatever has focus. Use this instead when the
   * scanner genuinely must not fire — a modal, a form mid-submit, a screen where
   * a stray scan would be destructive.
   *
   * Disabling requires holding the claim, so this claims first if the caller has
   * not already. Releasing afterwards hands the reader back and the device
   * default resumes, trigger included; the disable lasts as long as the claim.
   */
  @ReactMethod
  fun setTriggerEnabled(enabled: Boolean, promise: Promise) {
    try {
      triggerEnabled = enabled
      claimRequested = true
      sendClaim()
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("HWI_SET_TRIGGER_FAILED", t.message, t)
    }
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
      putBoolean("triggerEnabled", triggerEnabled)
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
      val intent = dcsIntent(HoneywellIntents.ACTION_CONTROL_SCANNER).apply {
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
    val intent = dcsIntent(HoneywellIntents.ACTION_CLAIM_SCANNER).apply {
      putExtra(HoneywellIntents.EXTRA_SCANNER, scanner)
      putExtra(HoneywellIntents.EXTRA_PROFILE, profile)
      putExtra(
        HoneywellIntents.EXTRA_PROPERTIES,
        ClaimRequest.buildProperties(scanAction, decoders, triggerEnabled)
      )
    }
    reactContext.sendBroadcast(intent)
    // The Intent API does not acknowledge a claim, so this is an assumption, not
    // a confirmation. It is reported to JS as `claimed` with that caveat
    // documented; the only real proof the reader is ours is a barcode arriving.
    claimed = true
    emitClaimState(true, "claimed")
  }

  private fun broadcastRelease() {
    val intent = dcsIntent(HoneywellIntents.ACTION_RELEASE_SCANNER).apply {
      putExtra(HoneywellIntents.EXTRA_SCANNER, scanner)
    }
    reactContext.sendBroadcast(intent)
    claimed = false
  }

  private fun sendRelease() {
    broadcastRelease()
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
