// ============================================================================
// serve.js — локальный статический сервер на встроенном модуле http.
//
// Зависимостей нет. Нужен потому, что ES-модули и Service Worker не
// работают при открытии файла через file://.
//
// Сервер рассчитан на постоянную работу и не завершается при помехах:
//   * занятый порт (например, после быстрого перезапуска TIME_WAIT) —
//     повторяет попытку, а не падает;
//   * ошибки при обработке запроса не трогают процесс;
//   * запросы кода, файлы которого изменились, обновляются на лету, так
//     что перезапуск для внесения правок не нужен.
//
// Флаги:
//   node serve.js            обычный запуск
//   node serve.js --port 9000
//   node serve.js --pid имя  файла с идентификатором процесса
// ============================================================================

import { createServer } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

const args = parseArgs(process.argv.slice(2));
const PORT = Number(args.port ?? process.env.PORT ?? 8000);
const HOST = args.host ?? process.env.HOST ?? '127.0.0.1';
const PID_FILE = args.pid === false ? null : (args.pid ?? `${ROOT}serve.pid`);

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

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--port' || arg === '-p') out.port = argv[++i];
    else if (arg === '--host' || arg === '-h') out.host = argv[++i];
    else if (arg === '--pid') out.pid = argv[++i];
    else if (arg === '--no-pid') out.pid = false;
  }
  return out;
}

/** Разрешает URL в путь внутри корня проекта. За пределы корня не выходит. */
async function resolveTarget(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null; // некорректная кодировка — отдаём 404, а не падаем
  }

  const relative = normalize(decoded).replace(/^[/\\]+/, '');
  if (relative.split(sep).includes('..')) return null;

  let target = resolve(ROOT, relative || 'index.html');
  if (!target.startsWith(ROOT)) return null;

  let info = await stat(target);

  if (info?.isDirectory()) {
    target = join(target, 'index.html');
    info = await stat(target);
  }

  if (!info?.isFile()) {
    // Незакрытый путь отдаёт оболочку игры: ссылки на новые модули
    // не приводят к ошибке 404
    target = join(ROOT, 'index.html');
    info = await stat(target);
    if (!info?.isFile()) return null;
  }

  return { target, info };
}

function stat(path) {
  return fs.stat(path).catch(() => null);
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    // Отдельный запрос не должен ронять сервер
    console.error('Ошибка обработки запроса:', error.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end('500');
  });
});

async function handle(req, res) {
  const resolved = await resolveTarget(req.url ?? '/');
  if (!resolved) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
    return;
  }

  const { target, info } = resolved;
  const isFile = extname(target).toLowerCase();

  const headers = {
    'Content-Type': MIME[isFile] ?? 'application/octet-stream',
    'Content-Length': info.size,
    // Разработка: файл всегда свежий, но не перекачивается без нужды
    'Cache-Control': 'no-cache',
  };

  // Service Worker должен иметь полный scope даже при запуске из подпапки
  if (target.endsWith('sw.js')) headers['Service-Worker-Allowed'] = '/';

  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    res.end();
    return;
  }

  res.writeHead(200, headers);

  const stream = createReadStream(target);
  stream.on('error', () => res.end());
  stream.pipe(res);
}

// --- Жизненный цикл ---------------------------------------------------------

let attempts = 0;

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    attempts += 1;
    const wait = Math.min(attempts * 500, 5000);

    if (attempts === 1) {
      console.log(`Порт ${PORT} занят. Пробую снова через ${wait / 1000} с…`);
    }

    if (attempts <= 20) {
      setTimeout(() => server.listen(PORT, HOST), wait);
      return;
    }

    console.error(`Порт ${PORT} занят и не освободился. Проверьте, не запущен ли сервер уже.`);
    process.exit(1);
  }

  console.error('Ошибка сервера:', error.message);
});

server.on('listening', async () => {
  attempts = 0;

  if (PID_FILE) await writePidFile(PID_FILE);

  console.log(`Город запущена: http://${HOST}:${PORT}`);
  console.log(`Корень: ${ROOT}`);
  console.log('Остановить: Ctrl+C или npm run serve:stop');
});

async function writePidFile(path) {
  try {
    await fs.writeFile(path, String(process.pid), 'utf8');
  } catch (error) {
    console.warn('Не удалось записать файл процесса:', error.message);
  }
}

async function removePidFile(path) {
  try {
    const saved = (await fs.readFile(path, 'utf8')).trim();
    // Удаляем только свой файл: вдруг сервер перезапустился
    if (Number(saved) === process.pid) await fs.unlink(path);
  } catch {
    // файла нет — ничего страшного
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\nОстанавливаю…');
    server.close(() => process.exit(0));
    // Страховка: не даём зависнуть на открытых соединениях
    setTimeout(() => process.exit(0), 1000).unref();
  });
}

process.on('exit', () => {
  if (PID_FILE) removePidFile(PID_FILE);
});

server.listen(PORT, HOST);