import UnoCSS from '@unocss/vite';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import solid from 'vite-plugin-solid';

const appDirectory = fileURLToPath(new URL('.', import.meta.url));
const explorerHtml = fileURLToPath(new URL('./explorer.html', import.meta.url));
const backgroundScript = fileURLToPath(new URL('./src/extension/background.ts', import.meta.url));
const extensionOutputDirectory = fileURLToPath(new URL('./dist-extension', import.meta.url));

export default defineConfig(({ mode }) => {
  const environment = { ...loadEnv(mode, appDirectory, ''), ...process.env };
  const googleOAuthClientId = environment.BROWSER_ATLAS_GOOGLE_OAUTH_CLIENT_ID?.trim();
  return {
    base: './',
    publicDir: 'extension/public',
    plugins: [
      solid(),
      UnoCSS({
        configFile: fileURLToPath(new URL('../../uno.config.ts', import.meta.url))
      }),
      configureGoogleOAuthManifest(googleOAuthClientId)
    ],
    build: {
      emptyOutDir: true,
      outDir: 'dist-extension',
      rolldownOptions: {
        input: {
          explorer: explorerHtml,
          background: backgroundScript
        },
        output: {
          entryFileNames: (chunkInfo) =>
            chunkInfo.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]'
        }
      }
    }
  };
});

/** Injects deployment-owned OAuth credentials without committing them to source control. */
function configureGoogleOAuthManifest(clientId: string | undefined): Plugin {
  if (clientId && !GOOGLE_OAUTH_CLIENT_ID_PATTERN.test(clientId)) {
    throw new Error('BROWSER_ATLAS_GOOGLE_OAUTH_CLIENT_ID is not a valid Google OAuth client ID.');
  }
  return {
    name: 'browser-atlas-google-oauth-manifest',
    async closeBundle() {
      if (!clientId) {
        return;
      }
      const manifestPath = `${extensionOutputDirectory}/manifest.json`;
      const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (!isRecord(manifest)) {
        throw new Error('Browser Atlas generated an invalid extension manifest.');
      }
      manifest.oauth2 = {
        client_id: clientId,
        scopes: ['https://www.googleapis.com/auth/drive.appdata']
      };
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const GOOGLE_OAUTH_CLIENT_ID_PATTERN = /^\d+-[\w-]+\.apps\.googleusercontent\.com$/u;
