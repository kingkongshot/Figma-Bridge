import fs from 'fs';
import path from 'path';

type Level = 'debug' | 'info' | 'warn' | 'error';

export type Logger = {
  dir: string;
  file: string;
  level: Level;
  log: (level: Level, message: string, meta?: any) => void;
  info: (message: string, meta?: any) => void;
  debug: (message: string, meta?: any) => void;
  warn: (message: string, meta?: any) => void;
  error: (message: string, meta?: any) => void;
  ephemeralFile: string;
  resetEphemeral: () => void;
  elog: (level: Level, message: string, meta?: any) => void;
};

function ensureDir(dir: string) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

export function createLogger(): Logger {
  const root = process.env.LOG_DIR || path.join(process.cwd(), 'debug', 'logs');
  ensureDir(root);
  const file = path.join(root, 'latest.log');
  const level = (String(process.env.LOG_LEVEL || 'info').toLowerCase() as Level);
  const ephemeralFile = file;

  try {
    for (const f of fs.readdirSync(root)) {
      if (f.endsWith('.log') && f !== path.basename(file)) {
        try { fs.unlinkSync(path.join(root, f)); } catch {}
      }
    }
  } catch {}

  function append(line: string) {
    try { fs.appendFileSync(file, line + '\n'); } catch {}
  }

  function log(level: Level, message: string, meta?: any) {
    const entry = {
      t: new Date().toISOString(),
      level,
      msg: message,
      meta: meta === undefined ? undefined : meta,
    };
    append(JSON.stringify(entry));
  }

  function elog(level: Level, message: string, meta?: any) {
    const entry = {
      t: new Date().toISOString(),
      level,
      msg: message,
      meta: meta === undefined ? undefined : meta,
    };
    try { fs.appendFileSync(ephemeralFile, JSON.stringify(entry) + '\n'); } catch {}
  }

  function resetEphemeral() {
    try { fs.writeFileSync(ephemeralFile, ''); } catch {}
  }

  return {
    dir: root,
    file,
    level,
    log,
    info: (m, meta) => log('info', m, meta),
    debug: (m, meta) => log('debug', m, meta),
    warn: (m, meta) => log('warn', m, meta),
    error: (m, meta) => log('error', m, meta),
    ephemeralFile,
    resetEphemeral,
    elog,
  };
}

export function listLogFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.log')).sort();
  } catch { return []; }
}

export function readTail(file: string, maxLines = 200): string[] {
  try {
    const data = fs.readFileSync(file, 'utf8');
    const lines = data.split(/\r?\n/).filter(Boolean);
    return lines.slice(Math.max(0, lines.length - maxLines));
  } catch { return []; }
}
