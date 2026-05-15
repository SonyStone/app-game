# Playwright E2E — Known Issues & Solutions

## The Problem: Chromium Headless Hangs on `mouse.move`

In this Docker/dev-container environment, **Chromium's headless mode deadlocks after ~2 consecutive `page.mouse.move()` calls**. This affects all drag-and-drop testing since drags require many sequential mouse moves.

### Symptoms

- `page.mouse.move()` hangs indefinitely on the 2nd or 3rd call
- Tests time out at `mouse.move`, `locator.click`, or `browserContext.newPage`
- Happens on **blank HTML pages with zero JavaScript** — proving it's not an app bug
- Both `chromium-headless-shell` (Playwright's default) and full Chromium with `--headless=new` are affected
- CDP `Input.dispatchMouseEvent` with `mouseMoved` also hangs — same underlying issue

### Root Cause

Chromium's compositor/input pipeline deadlocks in this container due to:

1. **`/dev/shm` is only 64MB** — Chromium uses shared memory for compositing; Docker defaults to 64MB which is too small
2. **No display server** — no X11/Wayland, so only headless mode is available
3. **Zombie process accumulation** — failed Chromium launches leave `<defunct>` processes (thousands over time); can't be reaped inside the container since their parent is PID 1

`--disable-dev-shm-usage`, `--disable-gpu`, and `--no-sandbox` flags do **not** fix this.

### Diagnosis Steps We Used

Created a minimal test file with 5 tests on a blank page:

```ts
// Single mouse.move → PASS
await page.mouse.move(50, 50);

// Two mouse.moves → PASS
await page.mouse.move(50, 50);
await page.mouse.move(60, 60);

// Three mouse.moves → HANG
await page.mouse.move(50, 50);
await page.mouse.move(60, 60);
await page.mouse.move(70, 70); // ← never resolves
```

Then compared browsers:

```ts
// Chromium (default headless-shell) → HANG
// Chromium (full, --headless=new)   → HANG
// Firefox                           → PASS ✓
```

### Diagnostic Commands

```bash
# Check /dev/shm size (64MB = problem)
df -h /dev/shm

# Count zombie chrome processes
ps aux | grep -c defunct

# Check for live chrome processes
ps aux | grep -i chrom | grep -v defunct | grep -v grep

# Check installed browsers
npx playwright install --dry-run
ls /root/.cache/ms-playwright/
```

## The Solution: Use Firefox

Firefox's Playwright integration uses a different protocol (Juggler, not CDP) and doesn't have this input pipeline issue. All mouse interactions work perfectly.

In `playwright.config.ts`:

```ts
projects: [
  {
    name: 'firefox',
    use: { ...devices['Desktop Firefox'] },
  }
],
```

Install Firefox + deps:

```bash
npx playwright install firefox
npx playwright install-deps firefox
```

### Performance

Firefox runs all 59 tests in ~22s with 10 parallel workers — comparable to Chromium when it was working.

## Other Infrastructure Lessons

### Port Cleanup

Vite dev servers can linger as zombies, blocking ports. The `dev` and `test` scripts now auto-clean:

```json
{
  "dev": "fuser -k 3055/tcp 2>/dev/null; vite --port 3055",
  "test": "fuser -k 3055/tcp 2>/dev/null; playwright test"
}
```

### `reuseExistingServer`

Set to `!process.env.CI` so Playwright reuses a running dev server locally but starts fresh in CI:

```ts
webServer: {
  command: 'pnpm dev',
  url: 'http://localhost:3055',
  reuseExistingServer: !process.env.CI,
}
```

### If You Need Chromium Later

If the container environment changes (larger `/dev/shm`, proper display), you can switch back:

```ts
projects: [
  {
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      launchOptions: {
        args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox'],
      },
    },
  }
],
```

Or if you control the Docker setup, increase shared memory:

```dockerfile
# In docker-compose.yml
shm_size: '2gb'

# Or in docker run
docker run --shm-size=2g ...
```
