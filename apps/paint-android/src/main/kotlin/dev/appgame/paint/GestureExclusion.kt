package dev.appgame.paint

import android.graphics.Rect
import android.view.View
import android.view.WindowInsets
import kotlin.math.roundToInt

/**
 * Keeps Android's back gesture off parts of the left and right screen edges of [view], so that a stroke or a panel
 * drag starting there stays in the page (`View.setSystemGestureExclusionRects`). The bottom edge cannot be excluded:
 * immersive mode only makes its first swipe show the bars.
 *
 * Android honors at most [limitPx] of excluded height per edge (200 dp), so this never asks for more. By default each
 * edge excludes a band of that height centered on where the pen last hovered, or on the edge's middle before that: the
 * pen always hovers before it touches, so the band is in place for its stroke. The page may instead name the ranges it
 * needs ([setRanges]); they are honored in the given order until the limit is used up.
 */
class GestureExclusion(private val view: View) {
    private var penY: Float? = null
    private var ranges: Edges? = null

    /** Vertical ranges per edge in view pixels, top inclusive and bottom exclusive. */
    data class Edges(val left: List<IntRange>, val right: List<IntRange>)

    /** The most excluded height Android honors per edge, in pixels. */
    val limitPx: Int
        get() = (LIMIT_DP * view.resources.displayMetrics.density).toInt() - 1

    init {
        view.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> apply() }
    }

    /**
     * The pen hovers at [y] (view pixels): moves the default bands there, in steps of [STEP_DP] so that Android is not
     * told on every hover event.
     */
    fun followPen(y: Float) {
        val step = STEP_DP * view.resources.displayMetrics.density
        val snapped = (y / step).roundToInt() * step
        if (snapped == penY) {
            return
        }

        penY = snapped
        if (ranges == null) {
            apply()
        }
    }

    /** Uses the page's ranges, or the default bands again for `null`; returns what was applied, clipped. */
    fun setRanges(next: Edges?): Edges {
        ranges = next
        return apply()
    }

    private fun apply(): Edges {
        val height = view.height
        val applied = ranges?.let { Edges(clip(it.left, height), clip(it.right, height)) } ?: run {
            val band = band(height)
            Edges(listOfNotNull(band), listOfNotNull(band))
        }
        val width = edgeWidth()
        val rects = applied.left.map { Rect(0, it.first, width, it.last + 1) } +
            applied.right.map { Rect(view.width - width, it.first, view.width, it.last + 1) }
        view.systemGestureExclusionRects = rects
        return applied
    }

    /** The default band: [limitPx] high, centered on the pen or the middle, inside the view. */
    private fun band(height: Int): IntRange? {
        if (height <= 0) {
            return null
        }

        val size = minOf(limitPx, height)
        val center = penY?.roundToInt() ?: (height / 2)
        val top = (center - size / 2).coerceIn(0, height - size)
        return top until top + size
    }

    /** Clips [ranges] to the view and to [limitPx] in total, in order. */
    private fun clip(ranges: List<IntRange>, height: Int): List<IntRange> {
        var left = limitPx
        return ranges.mapNotNull { range ->
            val top = range.first.coerceIn(0, height)
            val bottom = minOf((range.last + 1).coerceIn(0, height), top + left)
            if (bottom <= top) {
                null
            } else {
                left -= bottom - top
                top until bottom
            }
        }
    }

    /** As wide as the system's gesture area, which only counts where it overlaps; [MIN_WIDTH_DP] if unknown. */
    private fun edgeWidth(): Int {
        val density = view.resources.displayMetrics.density
        val insets = view.rootWindowInsets?.getInsetsIgnoringVisibility(WindowInsets.Type.systemGestures())
        val widest = maxOf(insets?.left ?: 0, insets?.right ?: 0)
        return maxOf(widest, (MIN_WIDTH_DP * density).toInt())
    }

    private companion object {
        /** Android's per-edge limit (`system_gesture_exclusion_limit_dp`); devices may lower it, not raise it. */
        const val LIMIT_DP = 200
        const val MIN_WIDTH_DP = 48
        const val STEP_DP = 16
    }
}
