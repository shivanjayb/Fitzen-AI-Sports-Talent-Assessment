import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      // Dev parity: serve the Vercel function api/ai.ts at /api/ai (runs before the /api proxy to :4000).
      name: 'fitzen-api-ai',
      configureServer(server) {
        Object.assign(process.env, loadEnv(mode, server.config.root, ''));
        const file = fileURLToPath(new URL('../../api/ai.ts', import.meta.url));
        server.middlewares.use('/api/ai', async (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const { POST } = (await server.ssrLoadModule(file)) as typeof import('../../api/ai');
          const r = await POST(new Request('http://localhost/api/ai', {
            method: 'POST', headers: req.headers as Record<string, string>, body: Buffer.concat(chunks),
          }));
          res.statusCode = r.status;
          r.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(await r.text());
        });
      },
    },
  ],
  build: {
    chunkSizeWarningLimit: 1600,
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
}));
