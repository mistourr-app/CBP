// ============================================================================
// check-boot.js — проверка запуска игры в настоящем браузере.
//
// Юнит-тесты выполняют игровую логику в Node и не видят ошибок сборки:
// обращения к несуществующему методу, потеря this при передаче ссылки на
// метод, падение при создании WebGL-контекста, сбой Service Worker.
// Именно так ломалась игра при первом открытии.
//
// Страницу открывает headless-браузер и выгружает результат.
// Если браузера нет, проверка молча пропускается с кодом 0.
//
//   node scripts/check-boot.js
// ============================================================================

import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGE = resolve(ROOT, 'scripts/boot-check.html');

const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].filter(Boolean);

const PORT = Number(process.env.PORT ?? 8000);
const BASE = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`;

const browser = BROWSERS.find((path) => existsSync(path));

if (!browser) {
  console.log('Браузер не найден — проверка запуска пропущена.');
  console.log('Задайте путь через переменную окружения BROWSER.');
  process.exit(0);
}

const profile = mkdtempSync(join(tmpdir(), 'cbp-boot-'));
const url = `${BASE}/scripts/boot-check.html`;

const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--virtual-time-budget=20000',
  `--user-data-dir=${profile}`,
  '--dump-dom',
  url,
];

let dom = '';

try {
  const { stdout } = await run(browser, args, { maxBuffer: 32 * 1024 * 1024, timeout: 90_000 });
  dom = stdout;
} catch (error) {
  console.error('Браузер завершился с ошибкой:', error.message);
  cleanup();
  process.exit(1);
}

cleanup();

const title = dom.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
const lines = [...dom.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map((m) =>
  decode(m[1]).replace(/^ok\s+|^\s+/, ''));

for (const line of lines) console.log(' ', line);

const passed = title.startsWith('PASS');
console.log('');
console.log(passed ? `Проверка запуска пройдена: ${title}` : `Проверка запуска не пройдена: ${title || 'нет ответа'}`);

if (!passed && lines.length === 0) {
  console.error('Браузер не вернул результат. Проверьте, что сервер запущен:', BASE);
}

process.exit(passed ? 0 : 1);

function decode(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function cleanup() {
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // временный профиль не удалился — ничего страшного
  }
}