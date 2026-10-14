package dev.appgame.hoverprobe

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.hardware.input.InputManager
import android.view.Gravity
import android.view.InputDevice
import android.view.MotionEvent
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowInsets
import android.webkit.ConsoleMessage
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject

/**
 * Fullscreen WebView that compares the pen hover Android delivers to this window with the
 * pen hover the loaded page receives as `pointermove` events.
 *
 * Chrome on Android loses pen hover per tab (after a file chooser, a PWA install, an intent
 * from another app); this app checks whether the embedded WebView loses it the same way.
 * The overlay shows both counters and turns red while Android reports hover and the page
 * does not; the same verdicts go to logcat under the `HoverProbe` tag.
 *
 * Launch with a page: `adb shell am start -n dev.appgame.hoverprobe/.MainActivity --es url URL`.
 * Without one it opens the last page, or the bundled probe page on first start.
 */
class MainActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private val prefs by lazy { getSharedPreferences("probe", MODE_PRIVATE) }
    private val native = NativePenStats()
    private var page = PageStats()
    private var verdict = Verdict.IDLE

    private lateinit var root: FrameLayout
    private lateinit var status: TextView
    private lateinit var buttons: LinearLayout
    private var webView: WebView? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(true)

        root = FrameLayout(this)
        root.setOnApplyWindowInsetsListener { view, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        root.addView(createOverlay(), FrameLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT, Gravity.BOTTOM or Gravity.START))
        setContentView(root)

        replaceWebView()
        load(urlFrom(intent) ?: prefs.getString(LAST_URL, null) ?: PROBE_URL)
        handler.post(poll)
        getSystemService(InputManager::class.java).registerInputDeviceListener(DeviceLogger(), handler)
    }

    /** Logs input device changes: a reconfigured stylus would explain state that a picker leaves behind. */
    private inner class DeviceLogger : InputManager.InputDeviceListener {
        override fun onInputDeviceAdded(deviceId: Int) {
            Log.i(TAG, "device added $deviceId ${InputDevice.getDevice(deviceId)?.name}")
        }

        override fun onInputDeviceRemoved(deviceId: Int) {
            Log.i(TAG, "device removed $deviceId")
        }

        override fun onInputDeviceChanged(deviceId: Int) {
            Log.i(TAG, "device changed $deviceId ${InputDevice.getDevice(deviceId)?.name}")
        }
    }

    /** `--ez newWebView true` replaces the WebView, so a script can reset between experiments. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getBooleanExtra("newWebView", false)) {
            replaceWebView()
            load(urlFrom(intent) ?: prefs.getString(LAST_URL, null) ?: PROBE_URL)
        } else {
            urlFrom(intent)?.let(::load)
        }
    }

    override fun onResume() {
        super.onResume()
        Log.i(TAG, "activity resume")
    }

    override fun onPause() {
        Log.i(TAG, "activity pause")
        super.onPause()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        Log.i(TAG, "window focus $hasFocus")
    }

    override fun onDestroy() {
        handler.removeCallbacks(poll)
        webView?.destroy()
        super.onDestroy()
    }

    @Deprecated("Plain Activity has no OnBackPressedDispatcher")
    override fun onBackPressed() {
        val view = webView
        if (view != null && view.canGoBack()) {
            view.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    /** Counts hover before any view sees it: every hover event of this window passes here. */
    override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
        if (event.isPen()) {
            native.onHover(event)
        }

        return super.dispatchGenericMotionEvent(event)
    }

    /** Logs pen contacts so logcat shows where hover stopped relative to strokes. */
    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.isPen()) {
            native.onTouch(event)
        }

        return super.dispatchTouchEvent(event)
    }

    @Deprecated("Plain Activity has no Activity Result API")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == FILE_REQUEST) {
            fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            fileCallback = null
            Log.i(TAG, "file chooser closed: result=$resultCode")
        } else {
            @Suppress("DEPRECATION")
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    private fun createOverlay(): LinearLayout {
        status = TextView(this).apply {
            typeface = Typeface.MONOSPACE
            textSize = 12f
            setTextColor(Color.WHITE)
            setPadding(16, 8, 16, 8)
            setOnClickListener { buttons.visibility = if (buttons.visibility == LinearLayout.VISIBLE) LinearLayout.GONE else LinearLayout.VISIBLE }
        }

        buttons = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(button("Probe") { load(PROBE_URL) })
            addView(button("Paint") { load(PAINT_URL) })
            addView(button("Local :3030") { load(LOCAL_PAINT_URL) })
            addView(button("Reload") { webView?.reload() })
            addView(button("New WebView") { replaceWebView(); load(prefs.getString(LAST_URL, null) ?: PROBE_URL) })
            addView(button("Reattach") { reattachWebView() })
            addView(button("Pause+Resume") { pauseAndResumeWebView() })
            addView(button("Hide+Show") { hideAndShowWebView() })
            addView(button("Reset") { native.reset(); webView?.evaluateJavascript(RESET_JS, null); Log.i(TAG, "reset counters") })
        }

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(buttons)
            addView(status)
        }
    }

    private fun button(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        textSize = 12f
        minHeight = 0
        minimumHeight = 0
        setOnClickListener { onClick() }
    }

    /** Swaps in a fresh WebView, the counterpart of "open a new tab" that restores hover in Chrome. */
    private fun replaceWebView() {
        webView?.let {
            root.removeView(it)
            it.destroy()
        }

        val view = WebView(this)
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            useWideViewPort = true
            loadWithOverviewMode = true
            mediaPlaybackRequiresUserGesture = false
        }
        view.webViewClient = WebViewClient()
        view.webChromeClient = ChromeClient()
        root.addView(view, 0, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        webView = view
        page = PageStats()
        Log.i(TAG, "new WebView ${WebView.getCurrentWebViewPackage()?.versionName}")
    }

    /** Workaround candidate that keeps the page: detaches the same WebView from the window and attaches it again. */
    private fun reattachWebView() {
        val view = webView ?: return
        root.removeView(view)
        root.addView(view, 0, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        view.requestFocus()
        Log.i(TAG, "workaround: reattach")
    }

    /** Workaround candidate that keeps the page: the WebView pause/resume an app sends on activity pause/resume. */
    private fun pauseAndResumeWebView() {
        val view = webView ?: return
        view.onPause()
        view.onResume()
        Log.i(TAG, "workaround: pause+resume")
    }

    /** Workaround candidate that keeps the page: hides the WebView for one frame. */
    private fun hideAndShowWebView() {
        val view = webView ?: return
        view.visibility = FrameLayout.INVISIBLE
        view.postOnAnimation { view.visibility = FrameLayout.VISIBLE }
        Log.i(TAG, "workaround: hide+show")
    }

    private fun load(url: String) {
        prefs.edit().putString(LAST_URL, url).apply()
        page = PageStats()
        Log.i(TAG, "load $url")
        webView?.loadUrl(url)
    }

    private fun urlFrom(intent: Intent?): String? = intent?.getStringExtra("url") ?: intent?.dataString

    /** Reads the page counters four times a second and redraws the overlay. */
    private val poll = object : Runnable {
        override fun run() {
            webView?.evaluateJavascript(PROBE_JS) { json ->
                page = PageStats.parse(json) ?: page
                render()
            }
            handler.postDelayed(this, POLL_MS)
        }
    }

    private fun render() {
        val next = Verdict.of(native, page)
        if (next != verdict) {
            Log.i(TAG, "verdict $verdict -> $next | ${native.describe()} | ${page.describe()}")
            verdict = next
        }

        status.text = "${verdict.label}\nAndroid  ${native.describe()}\nPage     ${page.describe()}\nWebView ${WebView.getCurrentWebViewPackage()?.versionName}"
        status.setBackgroundColor(verdict.color)
    }

    private inner class ChromeClient : WebChromeClient() {
        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            Log.i(TAG, "file chooser opened")

            return try {
                @Suppress("DEPRECATION")
                startActivityForResult(params.createIntent(), FILE_REQUEST)
                true
            } catch (error: ActivityNotFoundException) {
                fileCallback = null
                false
            }
        }

        override fun onConsoleMessage(message: ConsoleMessage): Boolean {
            Log.d(TAG, "console ${message.messageLevel()}: ${message.message()} (${message.sourceId()}:${message.lineNumber()})")
            return true
        }
    }

    private companion object {
        const val TAG = "HoverProbe"
        const val LAST_URL = "lastUrl"
        const val FILE_REQUEST = 1
        const val POLL_MS = 250L
        const val PROBE_URL = "file:///android_asset/probe.html"
        const val PAINT_URL = "https://paint-xi-gilt.vercel.app/"
        const val LOCAL_PAINT_URL = "http://localhost:3030/"
    }
}

private fun MotionEvent.isPen(): Boolean {
    val tool = getToolType(0)
    return tool == MotionEvent.TOOL_TYPE_STYLUS || tool == MotionEvent.TOOL_TYPE_ERASER
}

/** The MotionEvent fields Chromium may branch on, in one line. */
private fun MotionEvent.dump(): String =
    "dev=$deviceId src=0x${Integer.toHexString(source)} tool=${getToolType(0)} id=${getPointerId(0)} n=$pointerCount " +
        "buttons=$buttonState meta=$metaState flags=0x${Integer.toHexString(flags)} cls=$classification " +
        "edge=$edgeFlags p=${"%.2f".format(pressure)} dist=${"%.2f".format(getAxisValue(MotionEvent.AXIS_DISTANCE))} " +
        "tilt=${"%.2f".format(getAxisValue(MotionEvent.AXIS_TILT))} x=${x.toInt()} y=${y.toInt()}"

private fun ageText(ageMs: Long): String = if (ageMs < 0) "never" else "%.1f s ago".format(ageMs / 1000.0)

/** Pen hover and contacts as Android delivered them to the window. */
private class NativePenStats {
    var hoverCount = 0L
        private set
    private var lastHoverAt = 0L
    private var downCount = 0L

    /** Milliseconds since the last hover event, or -1 before the first one. */
    val hoverAgeMs: Long
        get() = if (lastHoverAt == 0L) -1 else System.currentTimeMillis() - lastHoverAt

    private var dumpNextMove = false

    /** Dumps enter, exit, the first move after enter and every other generic action, for before/after diffs. */
    fun onHover(event: MotionEvent) {
        when (event.actionMasked) {
            MotionEvent.ACTION_HOVER_MOVE -> {
                hoverCount++
                lastHoverAt = System.currentTimeMillis()
                if (dumpNextMove) {
                    dumpNextMove = false
                    Log.i("HoverProbe", "android hover move ${event.dump()}")
                }
            }
            MotionEvent.ACTION_HOVER_ENTER -> {
                dumpNextMove = true
                Log.i("HoverProbe", "android hover enter ${event.dump()}")
            }
            MotionEvent.ACTION_HOVER_EXIT -> Log.i("HoverProbe", "android hover exit ${event.dump()}")
            else -> Log.i("HoverProbe", "android generic ${MotionEvent.actionToString(event.action)} ${event.dump()}")
        }
    }

    fun onTouch(event: MotionEvent) {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downCount++
                Log.i("HoverProbe", "android pen down #$downCount")
            }
            MotionEvent.ACTION_UP -> Log.i("HoverProbe", "android pen up")
            MotionEvent.ACTION_CANCEL -> Log.i("HoverProbe", "android pen cancel")
        }
    }

    fun reset() {
        hoverCount = 0
        lastHoverAt = 0
        downCount = 0
    }

    fun describe() = "hover %6d  %-11s down %d".format(hoverCount, ageText(hoverAgeMs), downCount)
}

/** Pen hover the page received, read from the counters [PROBE_JS] installs. */
private data class PageStats(
    val hoverCount: Long = 0,
    /** Milliseconds since the last pen `pointermove` without buttons, or -1 before the first one. */
    val hoverAgeMs: Long = -1,
    val downCount: Long = 0,
    /** `pointerout` with a null `relatedTarget`: the lift signature of a Chrome tab without hover. */
    val leaveCount: Long = 0,
    val gpu: String = "?",
    /** Milliseconds since the counters were installed in the current document, or -1 before that. */
    val installedAgoMs: Long = -1,
    /** Buttonless `pointermove` counts of other pointer types, and all `mousemove` events. */
    val other: String = "",
) {
    fun describe() = "hover %6d  %-11s down %d  leave %d  WebGPU: %s  other: %s".format(hoverCount, ageText(hoverAgeMs), downCount, leaveCount, gpu, other)

    companion object {
        fun parse(json: String?): PageStats? {
            if (json == null || json == "null") {
                return null
            }

            return try {
                val o = JSONObject(json)
                PageStats(o.getLong("hover"), o.getLong("age"), o.getLong("down"), o.getLong("leave"), o.getString("gpu"), o.getLong("installed"), o.getString("other"))
            } catch (error: Exception) {
                null
            }
        }
    }
}

/** Whether the page gets the hover Android delivers. */
private enum class Verdict(val label: String, val color: Int) {
    IDLE("Hover the pen over the page", Color.argb(170, 40, 40, 40)),
    OK("Hover reaches the page", Color.argb(190, 20, 110, 40)),
    LOST("HOVER LOST: Android sends it, the page gets nothing", Color.argb(220, 170, 20, 20));

    companion object {
        /**
         * Lost when Android reported hover within 300 ms and the page has none for a second.
         * A document younger than a second stays idle: it has not had the chance to count yet.
         */
        fun of(native: NativePenStats, page: PageStats): Verdict {
            val nativeAge = native.hoverAgeMs
            if (nativeAge < 0 || nativeAge > 300 || page.installedAgoMs !in 1000..Long.MAX_VALUE) {
                return IDLE
            }

            return if (page.hoverAgeMs in 0..1000) OK else LOST
        }
    }
}

/** Installs pen counters on the current document once and returns them; evaluated every poll. */
private const val PROBE_JS = """
(() => {
  let p = window.__hoverProbe;
  if (!p) {
    p = window.__hoverProbe = { hover: 0, last: 0, down: 0, leave: 0, gpu: 'checking', since: Date.now(), moves: {}, mouse: 0, up: 0, cancel: 0 };
    const options = { capture: true, passive: true };
    addEventListener('pointermove', (e) => {
      if (e.buttons === 0) p.moves[e.pointerType] = (p.moves[e.pointerType] || 0) + 1;
      if (e.pointerType === 'pen' && e.buttons === 0) { p.hover++; p.last = Date.now(); }
    }, options);
    addEventListener('mousemove', () => { p.mouse++; }, options);
    addEventListener('pointerup', (e) => { if (e.pointerType === 'pen') p.up++; }, options);
    addEventListener('pointercancel', (e) => { if (e.pointerType === 'pen') p.cancel++; }, options);
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'pen') p.down++; }, options);
    addEventListener('pointerout', (e) => {
      if (e.pointerType === 'pen' && !e.relatedTarget) p.leave++;
    }, options);
    if (!navigator.gpu) {
      p.gpu = 'no navigator.gpu';
    } else {
      navigator.gpu.requestAdapter().then(
        (a) => { p.gpu = a ? 'adapter ok' : 'no adapter'; },
        (e) => { p.gpu = 'error ' + e; });
    }
  }
  return { hover: p.hover, age: p.last ? Date.now() - p.last : -1, down: p.down, leave: p.leave, gpu: p.gpu, installed: Date.now() - p.since,
    other: Object.entries(p.moves).filter(([t]) => t !== 'pen').map(([t, n]) => t + ' ' + n).join(', ') + ' mousemove ' + p.mouse + ' | pen up ' + p.up + ' cancel ' + p.cancel };
})()
"""

private const val RESET_JS = "if (window.__hoverProbe) Object.assign(window.__hoverProbe, { hover: 0, last: 0, down: 0, leave: 0, moves: {}, mouse: 0, up: 0, cancel: 0 })"
