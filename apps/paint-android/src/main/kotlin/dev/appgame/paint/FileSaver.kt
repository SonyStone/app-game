package dev.appgame.paint

import android.content.ContentResolver
import android.content.ContentValues
import android.net.Uri
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.widget.Toast
import org.json.JSONObject
import java.io.OutputStream
import java.util.concurrent.Executors

/**
 * Saves files the page hands over into the device's Downloads, in a `Paint` folder, where the Files app and other
 * apps find them. A WebView cannot download a blob, so this stands in for the browser's download.
 *
 * A file arrives as a stream, so a large drawing never has to sit in memory whole on either side:
 *
 * - `saveBegin {"name","mime"}` creates the file, hidden from other apps while it is written, and answers `{"id"}`.
 *   Android renames it (`name (1).png`) when the folder has one of that name.
 * - `saveChunk {"id","data"}` appends `data`, base64; the page sends the next chunk once this one is answered.
 * - `saveEnd {"id"}` shows the file to other apps and answers `{"name","uri"}`, with a short notice on screen.
 * - `saveCancel {"id"}` deletes what was written, with a notice that saving failed.
 *
 * Writes run on a background thread, one at a time, and answer on the main thread, as [ShellBridge] requires.
 */
class FileSaver(private val activity: MainActivity, bridge: ShellBridge) {
    private val resolver: ContentResolver = activity.contentResolver
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val open = mutableMapOf<String, OpenFile>()
    private var nextId = 1

    private class OpenFile(val uri: Uri, val name: String, val stream: OutputStream)

    init {
        bridge.command("saveBegin", ::begin)
        bridge.command("saveChunk", ::chunk)
        bridge.command("saveEnd", ::end)
        bridge.command("saveCancel", ::cancel)
    }

    private fun begin(params: JSONObject, reply: ShellBridge.Reply) {
        val name = params.getString("name").replace('/', '_')
        val mime = params.optString("mime").ifEmpty { "application/octet-stream" }
        val id = "save-${nextId++}"
        work(reply) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: error("Android refused to create $name in Downloads")
            val stream = resolver.openOutputStream(uri) ?: error("Android refused to open $name for writing")
            synchronized(open) { open[id] = OpenFile(uri, shownName(uri) ?: name, stream) }
            JSONObject().put("id", id)
        }
    }

    private fun chunk(params: JSONObject, reply: ShellBridge.Reply) {
        val file = file(params, reply) ?: return
        val data = params.getString("data")
        work(reply) {
            file.stream.write(Base64.decode(data, Base64.DEFAULT))
            JSONObject()
        }
    }

    private fun end(params: JSONObject, reply: ShellBridge.Reply) {
        val file = file(params, reply) ?: return
        val id = params.getString("id")
        work(reply) {
            file.stream.close()
            resolver.update(file.uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
            synchronized(open) { open.remove(id) }
            main.post { notice("Saved to Downloads/$FOLDER: ${file.name}") }
            JSONObject().put("name", file.name).put("uri", file.uri.toString())
        }
    }

    private fun cancel(params: JSONObject, reply: ShellBridge.Reply) {
        val id = params.getString("id")
        val file = synchronized(open) { open.remove(id) }
        if (file == null) {
            reply.result()
            return
        }

        work(reply) {
            runCatching { file.stream.close() }
            resolver.delete(file.uri, null, null)
            main.post { notice("Could not save ${file.name}") }
            JSONObject()
        }
    }

    /** The open file [params] names, or `null` after answering with an error. */
    private fun file(params: JSONObject, reply: ShellBridge.Reply): OpenFile? {
        val file = synchronized(open) { open[params.optString("id")] }
        if (file == null) {
            reply.error("unknown-file", "No file is being saved as ${params.optString("id")}")
        }

        return file
    }

    /** Runs [block] on the writing thread and answers with its result, or with its failure. */
    private fun work(reply: ShellBridge.Reply, block: () -> JSONObject) {
        io.execute {
            val result = runCatching(block)
            main.post {
                result.fold(
                    onSuccess = { reply.result(it) },
                    onFailure = { error ->
                        Log.e(TAG, "saving failed", error)
                        reply.error("failed", error.message ?: error.toString())
                    }
                )
            }
        }
    }

    /** The name Android gave the file at [uri], which differs from the one asked for when that one was taken. */
    private fun shownName(uri: Uri): String? =
        resolver.query(uri, arrayOf(MediaStore.Downloads.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }

    private fun notice(text: String) {
        if (!activity.isDestroyed) {
            Toast.makeText(activity, text, Toast.LENGTH_SHORT).show()
        }
    }

    companion object {
        private const val TAG = "PaintShell"

        /** The folder in Downloads the files go to. */
        const val FOLDER = "Paint"
    }
}
