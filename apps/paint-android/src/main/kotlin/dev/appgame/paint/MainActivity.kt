package dev.appgame.paint

import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.MotionEvent
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.window.OnBackInvokedDispatcher
import org.json.JSONArray
import org.json.JSONObject

/**
 * Paint in a fullscreen system WebView, for drawing on Android tablets without the browser in the way: system bars
 * stay hidden (an edge swipe first only shows them), the back gesture is kept off the side edges where the pen works
 * and otherwise goes to the page, and pen hover reaches the page even after Chromium stops reporting it.
 *
 * The page talks to the shell through [ShellBridge]; Paint's `features/native-shell` is its counterpart. Commands:
 * `info` (the shell's version and capabilities) and `setGestureExclusion` (see [setGestureExclusion]); events: `hover`
 * (see [PenHoverForwarder]); requests to the page: `back` (see [onBack]).
 *
 * Opens the URL given with `--es url URL` (or as the intent's data), else the last one, else [DEFAULT_URL].
 */
class MainActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private val prefs by lazy { getSharedPreferences("shell", MODE_PRIVATE) }
    private lateinit var webView: WebView
    private lateinit var bridge: ShellBridge
    private lateinit var hover: PenHoverForwarder
    private lateinit var exclusion: GestureExclusion
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var backPending = false
    private var exitDialog: AlertDialog? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(true)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
        window.setDecorFitsSystemWindows(false)

        webView = createWebView()
        setContentView(webView)
        hideSystemBars()

        val url = urlFrom(intent) ?: prefs.getString(LAST_URL, null) ?: DEFAULT_URL
        bridge = ShellBridge(webView, ShellBridge.DEPLOYED_ORIGINS + listOfNotNull(ShellBridge.localOrigin(url)))
        exclusion = GestureExclusion(webView)
        hover = PenHoverForwarder(webView, bridge) { event -> exclusion.followPen(event.y) }
        registerCommands()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { onBack() }
        }

        load(url)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        urlFrom(intent)?.let(::load)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // A dialog, the shade or another app may have brought the bars back.
        if (hasFocus) {
            hideSystemBars()
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        exitDialog?.dismiss()
        webView.destroy()
        super.onDestroy()
    }

    /** Below Android 13; from 13 on the callback registered in [onCreate] gets back instead. */
    @Deprecated("Replaced by OnBackInvokedDispatcher from Android 13")
    override fun onBackPressed() {
        onBack()
    }

    /** Every pen hover event of the window passes here before the WebView gets it. */
    override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
        hover.onGenericMotion(event)
        return super.dispatchGenericMotionEvent(event)
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        hover.onTouch(event)
        return super.dispatchTouchEvent(event)
    }

    @Deprecated("Plain Activity has no Activity Result API")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == FILE_REQUEST) {
            fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            fileCallback = null
        } else {
            @Suppress("DEPRECATION")
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    /**
     * Back never leaves Paint by accident: the page gets a `back` request first and answers `{"handled":true}` when it
     * closed something, such as a popup or a sheet. Otherwise, or when the page does not answer within
     * [BACK_TIMEOUT_MS] (no page connected, a page without a handler), the shell asks whether to exit.
     */
    private fun onBack() {
        if (backPending || exitDialog?.isShowing == true) {
            return
        }

        backPending = true
        bridge.request("back", JSONObject(), BACK_TIMEOUT_MS) { result ->
            backPending = false
            if (result?.optBoolean("handled") != true) {
                confirmExit()
            }
        }
    }

    private fun confirmExit() {
        exitDialog = AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Exit Paint?")
            .setPositiveButton("Exit") { _, _ -> exit() }
            .setNegativeButton("Cancel", null)
            .show()
    }

    /**
     * Moves the app to the background first, so that the page sees itself hidden and saves the drawing, and only then
     * ends it.
     */
    private fun exit() {
        moveTaskToBack(true)
        handler.postDelayed({ finishAndRemoveTask() }, EXIT_SAVE_MS)
    }

    private fun registerCommands() {
        bridge.command("info") { _, reply ->
            reply.result(
                JSONObject()
                    .put("shell", "paint-android")
                    .put("version", BuildConfig.VERSION_NAME)
                    .put("build", BuildConfig.VERSION_CODE)
                    .put("capabilities", JSONArray(bridge.capabilities))
                    .put("events", JSONArray(listOf("hover")))
                    .put("webView", WebView.getCurrentWebViewPackage()?.versionName)
                    .put("android", Build.VERSION.SDK_INT)
                    .put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            )
        }
        bridge.command("setGestureExclusion", ::setGestureExclusion)
    }

    /**
     * `setGestureExclusion`: params `{"left":[{"top","bottom"}],"right":[…]}` in CSS pixels name the parts of each side
     * edge where Android's back gesture must not start, most important first; `{}` (or no edges) goes back to the
     * default band that follows the pen. Answers `{"left":[…],"right":[…],"limit"}`: the ranges applied after clipping
     * to Android's per-edge limit, which `limit` gives in CSS pixels.
     */
    private fun setGestureExclusion(params: JSONObject, reply: ShellBridge.Reply) {
        val density = resources.displayMetrics.density
        fun ranges(name: String): List<IntRange> {
            val array = params.optJSONArray(name) ?: return emptyList()
            return (0 until array.length()).map { index ->
                val range = array.getJSONObject(index)
                (range.getDouble("top") * density).toInt() until (range.getDouble("bottom") * density).toInt()
            }
        }
        fun json(ranges: List<IntRange>) = JSONArray(ranges.map {
            JSONObject().put("top", it.first / density).put("bottom", (it.last + 1) / density)
        })

        val edges = if (params.has("left") || params.has("right")) GestureExclusion.Edges(ranges("left"), ranges("right")) else null
        val applied = exclusion.setRanges(edges)
        reply.result(JSONObject().put("left", json(applied.left)).put("right", json(applied.right)).put("limit", exclusion.limitPx / density))
    }

    /** Immersive mode: bars hidden, an edge swipe shows them over the page for a moment instead of acting. */
    private fun hideSystemBars() {
        window.insetsController?.apply {
            hide(WindowInsets.Type.systemBars())
            systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private fun createWebView(): WebView {
        val view = WebView(this)
        view.setBackgroundColor(Color.BLACK)
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            useWideViewPort = true
            loadWithOverviewMode = true
            mediaPlaybackRequiresUserGesture = false
            textZoom = 100
        }
        view.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                bridge.documentStarted()
            }
        }
        view.webChromeClient = ChromeClient()
        return view
    }

    private fun load(url: String) {
        prefs.edit().putString(LAST_URL, url).apply()
        bridge.allowLocal(url)
        Log.i(TAG, "load $url")
        webView.loadUrl(url)
    }

    private fun urlFrom(intent: Intent?): String? = intent?.getStringExtra("url") ?: intent?.dataString

    private inner class ChromeClient : WebChromeClient() {
        /** `<input type=file>`: Paint opens drawings and brush files through it. */
        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
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
        const val TAG = "PaintShell"
        const val LAST_URL = "lastUrl"
        const val FILE_REQUEST = 1
        const val BACK_TIMEOUT_MS = 500L
        const val EXIT_SAVE_MS = 1500L
        const val DEFAULT_URL = "https://app-game-one.vercel.app/paint/lego"
    }
}
