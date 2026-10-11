// Локальный статический сервер на встроенном модуле http.
// Зависимостей нет. Нужен потому, что ES-модули и Service Worker
// не работают при открытии файла через file://.

import { createServer } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
};

async function resolveTarget(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  if (relative.split(sep).includes('..')) return null;

  let target = join(ROOT, relative);
  let info = await fs.stat(target).catch(() => null);

  if (info?.isDirectory()) {
    target = join(target, 'index.html');
    info = await fs.stat(target).catch(() => null);
  }

  if (!info?.isFile()) {
    // SPA-подобный фолбэк: неизвестный путь отдаёт корень игры
    target = join(ROOT, 'index.html');
    info = await fs.stat(target).catch(() => null);
    if (!info?.isFile()) return null;
  }

  return { target, info };
}

const server = createServer(async (req, res) => {
  try {
    const resolved = await resolveTarget(req.url || '/');
    if (!resolved) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404');
      return;
    }

    const { target, info } = resolved;
    const type = MIME[extname(target).toLowerCase()] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
      // Service Worker должен иметь полный scope даже при запуске из подпапки
      ...(target.endsWith('sw.js') ? { 'Service-Worker-Allowed': '/' } : {}),
    });

    createReadStream(target).pipe(res);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`500: ${error.message}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`CBP запущена: http://${HOST}:${PORT}`);
  console.log('Остановить: Ctrl+C');
});