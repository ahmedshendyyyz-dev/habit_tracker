'use strict';
// Runs the habit_tracker site on this PC only. Nothing here is reachable from other devices.
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = Number(process.env.LIFE_PORT) || 4173;
const HOST = '127.0.0.1';
const URL_BASE = `http://${HOST}:${PORT}`;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.LIFE_DATA_DIR || path.join(__dirname, 'data');
const PHOTOS_DIR = path.join(DATA_DIR, 'photos');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const DATA_FILE = path.join(DATA_DIR, 'life-data.json');

const COLLECTIONS = ['tasks', 'habits', 'weights', 'workouts', 'courses', 'books', 'sessions', 'wishlist', 'trips', 'projects', 'bucket', 'goals', 'journal', 'reviews', 'profile'];
const MAX_JSON_BYTES = 20 * 1024 * 1024;
const MAX_PHOTO_BYTES = 50 * 1024 * 1024;

const PHOTO_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
};
const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function emptyData() {
  return { version: 1, rev: 0, items: Object.fromEntries(COLLECTIONS.map((key) => [key, []])) };
}

async function readData() {
  let text;
  try {
    text = await fsp.readFile(DATA_FILE, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return emptyData();
    throw error;
  }
  try {
    const data = JSON.parse(text);
    for (const key of COLLECTIONS) data.items[key] = data.items[key] || [];
    return data;
  } catch {
    // Never overwrite a file we could not read: saving stays blocked until it is fixed.
    throw new HttpError(500, 'life-data.json could not be read. Restore a copy from data/backups.');
  }
}

async function replaceFile(tempPath, finalPath) {
  // Windows can briefly lock a file (for example during an antivirus scan), so retry.
  for (let attempt = 0; ; attempt++) {
    try {
      await fsp.rename(tempPath, finalPath);
      return;
    } catch (error) {
      if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
}

async function backUpCurrentFile() {
  if (!fs.existsSync(DATA_FILE)) return;
  await fsp.copyFile(DATA_FILE, path.join(DATA_DIR, 'life-data.backup.json'));
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const daily = path.join(BACKUPS_DIR, `${stamp}.json`);
  if (!fs.existsSync(daily)) await fsp.copyFile(DATA_FILE, daily);
}

// Saves run one at a time so two requests can never interleave their writes.
let saveQueue = Promise.resolve();
function saveData(body) {
  const run = async () => {
    const items = body && body.items;
    const valid = items && typeof items === 'object'
      && COLLECTIONS.every((key) => Array.isArray(items[key]));
    if (!valid || !Number.isInteger(body.rev)) throw new HttpError(400, 'Invalid data.');

    const current = await readData();
    if (current.rev !== body.rev) {
      throw new HttpError(409, 'This changed in another tab. Reload the page to get the latest version.');
    }

    await backUpCurrentFile();
    const next = { version: 1, rev: current.rev + 1, items };
    const tempPath = `${DATA_FILE}.${crypto.randomUUID()}.tmp`;
    await fsp.writeFile(tempPath, JSON.stringify(next, null, 2), 'utf8');
    await replaceFile(tempPath, DATA_FILE);
    return { rev: next.rev };
  };
  const result = saveQueue.then(run, run);
  saveQueue = result.catch(() => {});
  return result;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) {
        reject(new HttpError(413, 'That is too much data to save at once.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function savePhoto(req, ext) {
  return new Promise((resolve, reject) => {
    if (!PHOTO_TYPES[ext]) {
      req.resume();
      reject(new HttpError(415, 'Use a JPG, PNG, WebP, GIF, AVIF or BMP image. iPhone HEIC photos need converting first.'));
      return;
    }
    const name = `${crypto.randomUUID()}${ext}`;
    const finalPath = path.join(PHOTOS_DIR, name);
    const tempPath = `${finalPath}.tmp`;
    const out = fs.createWriteStream(tempPath);
    let size = 0;
    let failed = false;

    const fail = (error) => {
      if (failed) return;
      failed = true;
      out.destroy();
      fsp.rm(tempPath, { force: true }).finally(() => reject(error));
    };

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_PHOTO_BYTES) {
        fail(new HttpError(413, 'That photo is larger than 50 MB.'));
        req.destroy();
        return;
      }
      if (!out.write(chunk)) {
        req.pause();
        out.once('drain', () => req.resume());
      }
    });
    req.on('end', () => {
      if (failed) return;
      if (size === 0) {
        fail(new HttpError(400, 'That photo is empty.'));
        return;
      }
      out.end(async () => {
        try {
          await replaceFile(tempPath, finalPath);
          resolve({ name });
        } catch (error) {
          fail(error);
        }
      });
    });
    req.on('error', fail);
    out.on('error', fail);
  });
}

function sendJson(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(value));
}

function sendFile(res, filePath, contentType, cacheControl) {
  const stream = fs.createReadStream(filePath);
  stream.on('open', () => {
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
    });
    stream.pipe(res);
  });
  stream.on('error', () => {
    if (!res.headersSent) sendJson(res, 404, { error: 'Not found.' });
    else res.destroy();
  });
}

// Blocks other websites open in the browser from reading or changing this data.
function isAllowed(req) {
  const hosts = [`${HOST}:${PORT}`, `localhost:${PORT}`];
  if (!hosts.includes(req.headers.host)) return false;
  if (req.method === 'GET') return true;
  const origin = req.headers.origin;
  const originOk = !origin || origin === `http://${hosts[0]}` || origin === `http://${hosts[1]}`;
  return originOk && req.headers['x-habit-tracker'] === '1';
}

async function route(req, res) {
  if (!isAllowed(req)) throw new HttpError(403, 'Not allowed.');
  const url = new URL(req.url, URL_BASE);
  const { pathname } = url;

  if (pathname === '/api/health' && req.method === 'GET') return sendJson(res, 200, { app: 'habit_tracker' });
  if (pathname === '/api/data' && req.method === 'GET') return sendJson(res, 200, await readData());
  if (pathname === '/api/data' && req.method === 'PUT') {
    return sendJson(res, 200, await saveData(await readJsonBody(req)));
  }
  if (pathname === '/api/photos' && req.method === 'POST') {
    const ext = String(url.searchParams.get('ext') || '').toLowerCase();
    return sendJson(res, 200, await savePhoto(req, ext));
  }
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');

  const photo = pathname.match(/^\/photos\/([a-z0-9-]+(\.[a-z]+))$/);
  if (photo) {
    if (!PHOTO_TYPES[photo[2]]) throw new HttpError(404, 'Not found.');
    return sendFile(res, path.join(PHOTOS_DIR, photo[1]), PHOTO_TYPES[photo[2]], 'private, max-age=31536000, immutable');
  }

  let relative;
  try {
    relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  } catch {
    throw new HttpError(400, 'Bad path.');
  }
  const filePath = path.resolve(PUBLIC_DIR, `.${relative}`);
  const type = STATIC_TYPES[path.extname(filePath)];
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) || !type) throw new HttpError(404, 'Not found.');
  return sendFile(res, filePath, type, 'no-cache');
}

function openBrowser() {
  if (process.env.LIFE_NO_OPEN) return;
  spawn('cmd', ['/c', 'start', '', URL_BASE], { stdio: 'ignore', detached: true }).unref();
}

async function main() {
  await fsp.mkdir(PHOTOS_DIR, { recursive: true });
  await fsp.mkdir(BACKUPS_DIR, { recursive: true });

  const server = http.createServer((req, res) => {
    route(req, res).catch((error) => {
      const status = error.status || 500;
      if (status === 500 && !error.status) console.error(error);
      if (res.headersSent) res.destroy();
      else sendJson(res, status, { error: error.status ? error.message : 'Something went wrong while saving or loading.' });
    });
  });

  server.on('error', async (error) => {
    if (error.code !== 'EADDRINUSE') throw error;
    try {
      const health = await (await fetch(`${URL_BASE}/api/health`)).json();
      if (health.app === 'habit_tracker') {
        console.log('habit_tracker is already running. Opening it in your browser.');
        openBrowser();
        process.exit(0);
      }
    } catch {
      // Another program owns the port: fall through to the message below.
    }
    console.error(`Port ${PORT} is being used by another program, so habit_tracker could not start.`);
    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    console.log(`habit_tracker is running at ${URL_BASE}`);
    console.log('Keep this window open while you use it. Close it when you are done.');
    openBrowser();
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
