# Paint for Android

An Android shell around the Paint web app: a fullscreen system WebView for drawing on tablets without the browser in
the way.

- System bars stay hidden (immersive sticky): an edge swipe first only shows them, so a stroke near the bottom edge
  does not go home.
- Android's back gesture is kept off a 200 dp band of each side edge that follows the hovering pen (Android's limit
  per edge). The page can name its own ranges with `setGestureExclusion`.
- Back goes to the page first, which closes an open popover, panel or sheet; when nothing was open the shell asks
  "Exit Paint?".
- Pen hover goes from Android to the page over the bridge as well, and Paint replays it whenever Chromium has
  stopped reporting it (crbug 573236768), so palm rejection keeps working without a fresh tab.

```sh
./gradlew assembleDebug
adb install -r build/outputs/apk/debug/paint-android-debug.apk
adb shell am start -n dev.appgame.paint/.MainActivity
adb shell am start -n dev.appgame.paint/.MainActivity --es url https://app-game-one.vercel.app/paint/studio
adb logcat -s PaintShell
```

The app opens the URL from `--es url`, else the last one, else the production Lego page
(`https://app-game-one.vercel.app/paint/lego`). Classic is `/paint/studio`; `/paint` lists every variant. For a local
dev server, `adb reverse tcp:PORT tcp:PORT` and pass `--es url http://localhost:PORT/paint/lego`; the bridge allows
`localhost` and `127.0.0.1` on the port of each URL loaded this way. Pages can be inspected from `chrome://inspect`
(or `adb forward tcp:9333 localabstract:webview_devtools_remote_$(adb shell pidof dev.appgame.paint)`).

The bridge contract is documented in `ShellBridge.kt` and, for the page, in Paint's
`src/features/native-shell/shellClient.ts`. Adding a native function means one `bridge.command` in `MainActivity.kt`
and its entry in `ShellMethods`.

Needs JDK 17 and the Android SDK (`local.properties` with `sdk.dir`, or `ANDROID_HOME`).
