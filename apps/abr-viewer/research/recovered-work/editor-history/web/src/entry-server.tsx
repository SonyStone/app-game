// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
          <title>ABR Viewer - Photoshop Brush Viewer</title>
          <meta name="description" content="View and analyze Adobe Photoshop brush (.abr) files. Preview brush tips, extract images, and explore brush parameters." />
          {assets}
        </head>
        <body class="bg-ps-bg-dark text-ps-text min-h-screen">
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
