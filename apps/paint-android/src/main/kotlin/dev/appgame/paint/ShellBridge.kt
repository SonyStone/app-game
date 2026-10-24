package dev.appgame.paint

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * The one channel between the Paint page and this shell: requests with responses in both directions, and events from
 * the shell to the page.
 *
 * The page sees it as `globalThis.paintShell`, an object WebView injects (`WebViewCompat.addWebMessageListener`) into
 * main frames of allowed origins only, before any page script runs. Every message is one JSON string:
 *
 * - `{"kind":"request","id":7,"method":"info","params":{}}`: a call; `id` is unique among the sender's open calls.
 * - `{"kind":"response","id":7,"result":{…}}` or `{"kind":"response","id":7,"error":{"code":"…","message":"…"}}`:
 *   the answer to the other side's request with that `id`. Each side numbers its own requests, so ids never mix.
 * - `{"kind":"event","name":"hover","data":{…}}`: a notification without an answer, shell to page only.
 *
 * The shell can only send once the page has sent something: WebView hands out the reply channel with the page's
 * first message, so the page calls `info` on start. A new document (a load or reload) drops the channel until it
 * calls again; shell requests open at that moment fail.
 *
 * Adding a native function: register it with [command] from the activity, answer through [Reply] (now or later, from
 * the main thread), list it in `info`'s `capabilities` (done by [command]) and add a typed wrapper to the page's
 * `features/native-shell` client. Everything here runs on the main thread.
 */
class ShellBridge(private val webView: WebView, origins: Collection<String>) {
    private val handler = Handler(Looper.getMainLooper())
    private val commands = linkedMapOf<String, Command>()
    private val origins = origins.toMutableSet()
    private val pending = mutableMapOf<Int, (JSONObject?) -> Unit>()
    private var page: JavaScriptReplyProxy? = null
    private var nextId = 1

    /** A native function the page calls by name; it answers once through [reply], at once or later. */
    fun interface Command {
        fun run(params: JSONObject, reply: Reply)
    }

    /** The answer to one page request. Only the first call counts. */
    inner class Reply internal constructor(private val id: Int, private val proxy: JavaScriptReplyProxy) {
        private var done = false

        fun result(value: JSONObject = JSONObject()) = send(JSONObject().put("result", value))

        /** A failure the page receives as a rejected promise with `code`. */
        fun error(code: String, message: String) =
            send(JSONObject().put("error", JSONObject().put("code", code).put("message", message)))

        private fun send(body: JSONObject) {
            if (done) {
                return
            }

            done = true
            post(proxy, body.put("kind", "response").put("id", id))
        }
    }

    /** Whether a page is connected: it sent a message since the current document started loading. */
    val connected: Boolean
        get() = page != null

    /** The names of the registered commands, for `info`. */
    val capabilities: List<String>
        get() = commands.keys.toList()

    init {
        check(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            "This WebView has no WebMessageListener; update Android System WebView"
        }
        register()
    }

    /** Registers [command] under [name], replacing an earlier one. */
    fun command(name: String, command: Command) {
        commands[name] = command
    }

    /** Sends an event to the page; dropped while no page is connected. */
    fun emit(name: String, data: JSONObject) {
        page?.let { post(it, JSONObject().put("kind", "event").put("name", name).put("data", data)) }
    }

    /**
     * Calls the page's handler for [method]. [onResult] receives the result, or `null` when no page is connected, the
     * page answers with an error, a new document starts, or [timeoutMs] passes first.
     */
    fun request(method: String, params: JSONObject, timeoutMs: Long, onResult: (JSONObject?) -> Unit) {
        val proxy = page
        if (proxy == null) {
            onResult(null)
            return
        }

        val id = nextId++
        pending[id] = onResult
        handler.postDelayed({ pending.remove(id)?.invoke(null) }, timeoutMs)
        post(proxy, JSONObject().put("kind", "request").put("id", id).put("method", method).put("params", params))
    }

    /** Lets the page at [url] use the bridge if it is a local dev server not yet allowed; returns whether it changed. */
    fun allowLocal(url: String): Boolean {
        val origin = localOrigin(url) ?: return false
        if (!origins.add(origin)) {
            return false
        }

        WebViewCompat.removeWebMessageListener(webView, JS_OBJECT)
        register()
        return true
    }

    /** A new document started loading: the old page's channel and its open calls end. */
    fun documentStarted() {
        page = null
        val callbacks = pending.values.toList()
        pending.clear()
        callbacks.forEach { it(null) }
    }

    private fun register() {
        WebViewCompat.addWebMessageListener(webView, JS_OBJECT, origins) { _, message, sourceOrigin, isMainFrame, proxy ->
            if (isMainFrame) {
                page = proxy
                receive(message, proxy)
            } else {
                Log.w(TAG, "ignored a message from a subframe of $sourceOrigin")
            }
        }
        Log.i(TAG, "bridge for $origins")
    }

    private fun receive(message: WebMessageCompat, proxy: JavaScriptReplyProxy) {
        val json = try {
            JSONObject(message.data ?: return)
        } catch (error: Exception) {
            Log.w(TAG, "unreadable message: ${error.message}")
            return
        }

        when (json.optString("kind")) {
            "request" -> {
                val id = json.optInt("id")
                val method = json.optString("method")
                val reply = Reply(id, proxy)
                val command = commands[method]
                if (command == null) {
                    reply.error("unknown-method", "The shell has no method $method")
                    return
                }

                try {
                    command.run(json.optJSONObject("params") ?: JSONObject(), reply)
                } catch (error: Exception) {
                    Log.e(TAG, "$method failed", error)
                    reply.error("failed", error.message ?: error.toString())
                }
            }
            "response" -> {
                val callback = pending.remove(json.optInt("id")) ?: return
                callback(json.optJSONObject("result").takeIf { !json.has("error") })
            }
            else -> Log.w(TAG, "unknown message kind ${json.optString("kind")}")
        }
    }

    private fun post(proxy: JavaScriptReplyProxy, json: JSONObject) {
        try {
            proxy.postMessage(json.toString())
        } catch (error: IllegalStateException) {
            // The proxy's document is gone.
            if (proxy == page) {
                page = null
            }
        }
    }

    companion object {
        private const val TAG = "PaintShell"

        /** The name of the injected object: `globalThis.paintShell`. */
        const val JS_OBJECT = "paintShell"

        /**
         * The deployed Paint origins. Kept explicit, not a wildcard over vercel.app: any Vercel site could otherwise call
         * the native functions, which will include file access.
         */
        val DEPLOYED_ORIGINS = listOf("https://app-game-one.vercel.app", "https://paint-xi-gilt.vercel.app")

        /**
         * The origin of [url] if it is a local dev server (`localhost` or `127.0.0.1` through `adb reverse`), which
         * the bridge may allow. Origin rules cannot leave the port open, so each port is added when first loaded.
         */
        fun localOrigin(url: String): String? {
            val uri = Uri.parse(url)
            if (uri.scheme != "http" && uri.scheme != "https") {
                return null
            }

            if (uri.host != "localhost" && uri.host != "127.0.0.1") {
                return null
            }

            return if (uri.port == -1) "${uri.scheme}://${uri.host}" else "${uri.scheme}://${uri.host}:${uri.port}"
        }
    }
}
