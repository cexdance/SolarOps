import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import sourceIdentifierPlugin from 'vite-plugin-source-identifier'

const isProd = process.env.BUILD_MODE === 'prod'
export default defineConfig({
  plugins: [
    react(),
    sourceIdentifierPlugin({
      enabled: !isProd,
      attributePrefix: 'data-matrix',
      includeProps: true,
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    historyApiFallback: true,
    proxy: {
      // Proxy Xero token endpoint to avoid CORS in dev
      '/xero-token': {
        target: 'https://identity.xero.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/xero-token/, '/connect/token'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Strip browser cookies — they bloat headers past Xero's 8192 byte limit
            proxyReq.removeHeader('cookie');
            proxyReq.removeHeader('origin');
          });
        },
      },
      // Proxy Xero API (invoices, contacts, connections)
      '/xero-api': {
        target: 'https://api.xero.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/xero-api/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('cookie');
            proxyReq.removeHeader('origin');
          });
        },
      },
      // Proxy SolarEdge Monitoring API — rewrites /api/solaredge?path=/X&... → /X?...
      '/api/solaredge': {
        target: 'https://monitoringapi.solaredge.com',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const url = new URL(req.url!, 'http://localhost');
            const apiPath = url.searchParams.get('path') || '/sites/list';
            url.searchParams.delete('path');
            proxyReq.path = apiPath + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '');
          });
        },
      },
    },
  },
})
