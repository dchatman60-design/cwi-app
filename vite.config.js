import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Local dev only: serve the Vercel functions in /api (e.g. /api/extract-measurements)
 * from `npm run dev`, so you don't need the Vercel CLI. On Vercel they run natively.
 */
function vercelApiInDev() {
  return {
    name: 'vercel-api-in-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        const match = url.pathname.match(/^\/api\/([\w-]+)$/)
        if (!match) return next()

        const file = resolve(server.config.root, 'api', `${match[1]}.js`)
        try {
          const { mtimeMs } = await stat(file)
          const mod = await import(`${pathToFileURL(file).href}?v=${mtimeMs}`)
          const handler = mod[req.method]
          if (!handler) {
            res.statusCode = 405
            return res.end()
          }

          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const headers = new Headers()
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') headers.set(key, value)
          }
          const hasBody = !['GET', 'HEAD'].includes(req.method)
          const response = await handler(
            new Request(url.href, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined }),
          )

          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (err) {
          if (err.code === 'ENOENT') return next()
          console.error(err)
          res.statusCode = 500
          res.end(String(err))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Give the /api functions their server-only env vars (OPENAI_API_KEY, etc.) in dev
  if (mode === 'development') Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    plugins: [
      react(),
      tailwindcss(),
      vercelApiInDev(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'CWI Field App',
          short_name: 'CWI Field',
          description: 'Measurements, drawings, quotes, and tasks for Custom Weatherstrip, Inc.',
          theme_color: '#0f172a',
          background_color: '#f8fafc',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              // Last-seen data (jobs, tasks, clients…) stays viewable offline.
              // Network first, so online users always get fresh data.
              urlPattern: ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/rest/v1/'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'supabase-data',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
      }),
    ],
  }
})
