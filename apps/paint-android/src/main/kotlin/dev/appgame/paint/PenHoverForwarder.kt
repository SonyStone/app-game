package dev.appgame.paint

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import org.json.JSONObject

/**
 * Sends the pen hover Android delivers to this window to the page as `hover` events, because Chromium stops reporting
 * it to the page after a covering window (the file chooser, the notification shade, rotation) around a pen contact,
 * while Android keeps delivering it (crbug 573236768). The WebView still gets the events too.
 *
 * Event data, in CSS pixels of [view] and radians:
 * `{"phase":"enter"|"move"|"exit","x","y","tilt","orientation","distance","eraser","buttons","time","sentAt"}`.
 * `tilt` is the angle from the screen's normal and `orientation` the direction it leans to, as Android reports them;
 * `buttons` is Android's button state (the barrel buttons); `time` is the event's `SystemClock.uptimeMillis` and
 * `sentAt` the same clock when sent, so `sentAt - time` is the delay in the shell.
 *
 * Android ends hover with `HOVER_EXIT` right before the pen touches down; that exit is held for [EXIT_DELAY_MS] and
 * dropped if the pen touches down meanwhile, so `exit` only means the pen left its hover range or the window. After a
 * lift Android starts hover again with `HOVER_ENTER`.
 */
class PenHoverForwarder(private val view: View, private val bridge: ShellBridge, private val onHover: (MotionEvent) -> Unit) {
    private val handler = Handler(Looper.getMainLooper())
    private var pendingExit: Runnable? = null
    private val location = IntArray(2)

    /** Takes every generic motion event of the window; forwards pen hover and ignores the rest. */
    fun onGenericMotion(event: MotionEvent) {
        if (!event.isPen()) {
            return
        }

        when (event.actionMasked) {
            MotionEvent.ACTION_HOVER_ENTER -> {
                cancelExit()
                send(event, "enter")
            }
            MotionEvent.ACTION_HOVER_MOVE -> {
                cancelExit()
                send(event, "move")
            }
            MotionEvent.ACTION_HOVER_EXIT -> {
                cancelExit()
                val data = data(event, "exit")
                val exit = Runnable {
                    pendingExit = null
                    bridge.emit("hover", data.put("sentAt", SystemClock.uptimeMillis()))
                }
                pendingExit = exit
                handler.postDelayed(exit, EXIT_DELAY_MS)
            }
            else -> return
        }

        onHover(event)
    }

    /** Takes every touch event of the window: a pen touching down was not leaving, see [PenHoverForwarder]. */
    fun onTouch(event: MotionEvent) {
        if (event.isPen() && event.actionMasked == MotionEvent.ACTION_DOWN) {
            cancelExit()
        }
    }

    private fun cancelExit() {
        pendingExit?.let(handler::removeCallbacks)
        pendingExit = null
    }

    private fun send(event: MotionEvent, phase: String) {
        if (bridge.connected) {
            bridge.emit("hover", data(event, phase).put("sentAt", SystemClock.uptimeMillis()))
        }
    }

    private fun data(event: MotionEvent, phase: String): JSONObject {
        view.getLocationInWindow(location)
        val density = view.resources.displayMetrics.density
        return JSONObject()
            .put("phase", phase)
            .put("x", ((event.x - location[0]) / density).toDouble())
            .put("y", ((event.y - location[1]) / density).toDouble())
            .put("tilt", event.getAxisValue(MotionEvent.AXIS_TILT).toDouble())
            .put("orientation", event.getAxisValue(MotionEvent.AXIS_ORIENTATION).toDouble())
            .put("distance", event.getAxisValue(MotionEvent.AXIS_DISTANCE).toDouble())
            .put("eraser", event.getToolType(0) == MotionEvent.TOOL_TYPE_ERASER)
            .put("buttons", event.buttonState)
            .put("time", event.eventTime)
    }

    private companion object {
        /** Android sends the touch-down within a few milliseconds of its exit. */
        const val EXIT_DELAY_MS = 60L
    }
}

/** Whether the event's first pointer is a pen tip or its eraser end. */
fun MotionEvent.isPen(): Boolean {
    val tool = getToolType(0)
    return tool == MotionEvent.TOOL_TYPE_STYLUS || tool == MotionEvent.TOOL_TYPE_ERASER
}
