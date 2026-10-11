// ============================================================================
// serve-ctl.js — управление фоновым сервером: start | stop | status | restart
//
// Запуск в фоне нужен, чтобы сервер не занимал отдельное окно терминала и
// не останавливался вместе с ним. Процесс отсоединяется от вызывающего
// терминала и продолжает работать.
//
//   node serve-ctl.js start     запустить в фоне
//   node serve-ctl.js stop      остановить
//   node serve-ctl.js status    проверить
//   node serve-ctl.js restart   перезапустить
// ============================================================================

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PID_FILE = resolve(ROOT, 'serve.pid');
const LOG_FILE = resolve(ROOT, 'serve.log');
const ERR_FILE = resolve(ROOT, 'serve.err.log');

const command = process.argv[2] ?? 'status';
const PORT = Number(process.env.PORT ?? 8000);
const HOST = process.env.HOST ?? '127.0.0.1';

async function readPid() {
  try {
    const pid = Number((await fs.readFile(PID_FILE, 'utf8')).trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function portOpen() {
  return new Promise((done) => {
    const socket = net.connect({ host: HOST, port: PORT });
    const finish = (value) => {
      socket.destroy();
      done(value);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function stop() {
  const pid = await readPid();

  if (!pid || !isAlive(pid)) {
    console.log('Сервер не запущен.');
    await fs.unlink(PID_FILE).catch(() => {});
    return true;
  }

  try {
    // Именно SIGINT: так срабатывает обработчик, снимающий файл процесса
    process.kill(pid, 'SIGINT');
  } catch (error) {
    console.error('Не удалось остановить процесс', pid, error.message);
    return false;
  }

  for (let i = 0; i < 40; i += 1) {
    await sleep(100);
    if (!isAlive(pid)) break;
  }

  if (isAlive(pid)) {
    console.log('Процесс не завершился, отправляем SIGKILL');
    try { process.kill(pid, 'SIGKILL'); } catch { /* уже ушёл */ }
  }

  await fs.unlink(PID_FILE).catch(() => {});
  console.log('Сервер остановлен.');
  return true;
}

async function start() {
  const pid = await readPid();
  if (pid && isAlive(pid)) {
    console.log(`Сервер уже запущен (PID ${pid}).`);
    console.log(`Адрес: http://${HOST}:${PORT}`);
    return true;
  }

  await fs.unlink(PID_FILE).catch(() => {});

  const out = await fs.open(LOG_FILE, 'a').catch(() => null);
  const err = await fs.open(ERR_FILE, 'a').catch(() => null);

  // detached + unref: процесс переживает завершение этого терминала
  const child = spawn(process.execPath, ['serve.js'], {
    cwd: ROOT,
    detached: true,
    stdio: [
      'ignore',
      out?.fd ?? 'ignore',
      err?.fd ?? 'ignore',
    ],
  });

  child.unref();
  await out?.close().catch(() => {});
  await err?.close().catch(() => {});

  // Ждём, пока сервер поднимется
  for (let i = 0; i < 50; i += 1) {
    await sleep(100);
    if (await portOpen()) {
      console.log(`Сервер запущен в фоне: http://${HOST}:${PORT}`);
      console.log(`Логи: ${LOG_FILE}`);
      console.log('Остановить: npm run serve:stop');
      return true;
    }
    if (!isAlive(child.pid)) break;
  }

  console.error('Сервер не поднялся. Смотрите serve.err.log');
  try {
    console.error(await fs.readFile(ERR_FILE, 'utf8'));
  } catch { /* файла нет */ }
  return false;
}

async function status() {
  const pid = await readPid();
  const alive = pid ? isAlive(pid) : false;
  const listening = await portOpen();

  console.log(`Процесс: ${alive ? `работает, PID ${pid}` : 'не найден'}`);
  console.log(`Порт ${PORT}: ${listening ? 'слушает' : 'не отвечает'}`);
  console.log(`Адрес: http://${HOST}:${PORT}`);

  if (alive) {
    const saved = await readPid();
    console.log(`Идентификатор: ${PID_FILE} (${saved})`);
  }
  return alive && listening;
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

const actions = { start, stop, status, restart: async () => (await stop()) && start() };

const action = actions[command];
if (!action) {
  console.error(`Неизвестная команда: ${command}`);
  console.error(`Доступно: ${Object.keys(actions).join(', ')}`);
  process.exit(1);
}

action()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });