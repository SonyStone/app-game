# Android hover probe

A minimal Android app with a fullscreen system WebView. It checks whether the pen-hover loss we
see in Chrome on Android (per tab, after a file chooser, a PWA install or an intent from another
app) also happens in an embedded WebView.

The overlay compares pen hover as Android delivers it to the window (`dispatchGenericMotionEvent`)
with pen `pointermove` events without buttons that the page receives. It turns red ("HOVER LOST")
when Android reports hover and the page gets none, and shows whether `navigator.gpu` gives an
adapter. Tap the overlay text to hide the buttons.

```sh
./gradlew assembleDebug
adb install -r build/outputs/apk/debug/android-hover-probe-debug.apk
adb shell am start -n dev.appgame.hoverprobe/.MainActivity --es url https://paint-xi-gilt.vercel.app/
adb logcat -s HoverProbe
```

Without `--es url` the app opens the last page, or the bundled probe page (`src/main/assets/probe.html`)
on first start. "Local :3030" opens the Paint dev server and needs `adb reverse tcp:3030 tcp:3030`.
"New WebView" replaces the WebView, the counterpart of opening a new Chrome tab. The page can be
inspected from `chrome://inspect` because WebView debugging is enabled.

Needs JDK 17 and the Android SDK (`local.properties` with `sdk.dir`, or `ANDROID_HOME`).
