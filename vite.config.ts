import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function ghostApkServerPlugin(): Plugin {
  const apkRelPath = 'releases/Ghost-v1.7.0.apk';
  const metaRelPath = 'releases/apk-metadata.json';

  const attachMiddlewares = (middlewares: {
    use: (fn: (req: any, res: any, next: () => void) => void) => void;
  }) => {
    middlewares.use((req, res, next) => {
      const url = (req.url || '').split('?')[0];

      if (url.startsWith('/downloads/Ghost-v') && url.endsWith('.apk')) {
        const apkPath = path.resolve(process.cwd(), apkRelPath);
        if (!fs.existsSync(apkPath)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'APK not built yet' }));
          return;
        }
        const stat = fs.statSync(apkPath);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="Ghost-v1.7.0.apk"'
        );
        res.setHeader('Content-Length', String(stat.size));
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(apkPath).pipe(res);
        return;
      }

      if (url === '/api/apk-meta') {
        const apkPath = path.resolve(process.cwd(), apkRelPath);
        const metaPath = path.resolve(process.cwd(), metaRelPath);
        if (fs.existsSync(metaPath)) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(fs.readFileSync(metaPath, 'utf-8'));
          return;
        }
        if (fs.existsSync(apkPath)) {
          const buf = fs.readFileSync(apkPath);
          const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              available: true,
              fileName: 'Ghost-v1.7.0.apk',
              packageName: 'ai.ghost.agent',
              versionName: '1.7.0',
              versionCode: 8,
              minSdk: 26,
              targetSdk: 34,
              sizeBytes: buf.length,
              sha256,
              signatureSchemes: [
                'APK Signature Scheme v2 (Verified)',
                'APK Signature Scheme v3 (Verified)',
              ],
            })
          );
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ available: false }));
        return;
      }

      next();
    });
  };

  return {
    name: 'ghost-apk-server',
    configureServer(server) {
      attachMiddlewares(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddlewares(server.middlewares);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), ghostApkServerPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
});
