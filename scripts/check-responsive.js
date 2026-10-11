// ============================================================================
// check-responsive.js — проверка вёрстки на разных ширинах экрана.
//
// Основная планировка мобильная, поэтому важно поведение на узких
// экранах: ресурсы должны остаться в одну строку, ничего не должно
// вылезать по горизонтали или наезжать друг на друга.
//
//   node scripts/check-responsive.js
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
  console.log('Браузер не найден — проверка вёрстки пропущена.');
  process.exit(0);
}

const profile = mkdtempSync(join(tmpdir(), 'cbp-resp-'));

const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--window-size=1400,1200',
  '--virtual-time-budget=40000',
  `--user-data-dir=${profile}`,
  '--dump-dom',
  `${BASE}/scripts/responsive-check.html`,
];

let dom = '';

try {
  const { stdout } = await run(browser, args, { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
  dom = stdout;
} catch (error) {
  console.error('Браузер завершился с ошибкой:', error.message);
  cleanup();
  process.exit(1);
}

cleanup();

const title = dom.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
const output = dom.match(/<ul id="out">([\s\S]*?)<\/ul>/)?.[1] ?? '';

const lines = [...decode(output).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
  .map((m) => decode(m[1].replace(/<[^>]+>/g, '')));

for (const line of lines) console.log(' ', line);

const failedCount = lines.filter((l) => l.startsWith('FAIL')).length;
const passed = title.startsWith('PASS');

console.log('');
console.log(passed
  ? `Проверка вёрстки пройдена: ${title}`
  : `Проверка вёрстки не пройдена: ${title || 'нет ответа'}${failedCount ? `, провалов ${failedCount}` : ''}`);

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