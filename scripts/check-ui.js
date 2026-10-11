// ============================================================================
// check-ui.js — проверка интерфейса в настоящем браузере.
//
// Проверка запуска видит, что игра не падает. Эта проверяет, что интерфейс
// показывает то, что должен: показатели, порядок действий, раскрытие
// хроники, одинаковую высоту карточек.
//
//   node scripts/check-ui.js
// ============================================================================

import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));

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
  console.log('Браузер не найден — проверка интерфейса пропущена.');
  process.exit(0);
}

const profile = mkdtempSync(join(tmpdir(), 'cbp-ui-'));

const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  // Нужна ширина: карточки перестраиваются по брейкпоинтам
  '--window-size=1280,1024',
  '--virtual-time-budget=25000',
  `--user-data-dir=${profile}`,
  '--dump-dom',
  `${BASE}/scripts/ui-check.html`,
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
const output = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)?.[1] ?? '';

for (const line of decode(output).split('\n').filter(Boolean)) console.log(' ', line);

const passed = title.startsWith('PASS');
console.log('');
console.log(passed ? `Проверка интерфейса пройдена: ${title}` : `Проверка интерфейса не пройдена: ${title || 'нет ответа'}`);

if (!passed && !output) {
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
    // временный профиль не удалился
  }
}