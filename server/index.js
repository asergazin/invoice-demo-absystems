import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureDatabase,
  importInvoices,
  listInvoices,
  permanentlyDeleteInvoices,
  restoreInvoices,
  softDeleteInvoices,
  updateInvoice,
} from './db.js';
import { extractDocumentData } from './gemini.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3001);
const sessionCookieName = 'invoice_demo_session';

app.set('trust proxy', true);
app.use(express.json({ limit: process.env.JSON_LIMIT || '30mb' }));

const authUser = process.env.APP_USERNAME;
const authPassword = process.env.APP_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET || process.env.APP_PASSWORD || 'invoice-demo-local-secret';

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function signSession(payload) {
  return crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
}

function createSessionToken(username) {
  const payload = `${username}.${Date.now()}`;
  return `${payload}.${signSession(payload)}`;
}

function verifySessionToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const payload = `${parts[0]}.${parts[1]}`;
  const expected = signSession(payload);
  const received = parts[2];
  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))
  ) {
    return null;
  }

  const issuedAt = Number(parts[1]);
  const maxAgeMs = 1000 * 60 * 60 * 12;
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > maxAgeMs) return null;

  return { username: parts[0] };
}

function setSessionCookie(req, res, token) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=43200',
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

function getSession(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[sessionCookieName]);
}

function requireAuth(req, res, next) {
  if (!authUser || !authPassword) return next();

  const session = getSession(req);
  if (session?.username === authUser) {
    req.user = session;
    return next();
  }

  res.status(401).json({ error: 'Authentication required' });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/auth/status', (req, res) => {
  const session = getSession(req);
  res.json({
    authenticated: Boolean(session?.username === authUser),
    user: session?.username === authUser ? { name: 'Администратор' } : null,
  });
});

app.post('/api/auth/login', (req, res) => {
  if (!authUser || !authPassword) {
    return res.json({ authenticated: true, user: { name: 'Администратор' } });
  }

  const { username, password } = req.body || {};
  if (username !== authUser || password !== authPassword) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  setSessionCookie(req, res, createSessionToken(authUser));
  res.json({ authenticated: true, user: { name: 'Администратор' } });
});

app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ authenticated: false });
});

app.use('/api', requireAuth);

app.get('/api/invoices', async (_req, res, next) => {
  try {
    res.json(await listInvoices());
  } catch (error) {
    next(error);
  }
});

app.post('/api/invoices/import', async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    res.json(await importInvoices(rows));
  } catch (error) {
    next(error);
  }
});

app.patch('/api/invoices/:id', async (req, res, next) => {
  try {
    const updated = await updateInvoice(req.params.id, req.body.field, req.body.value);
    if (!updated) return res.status(404).json({ error: 'Invoice not found' });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

app.post('/api/invoices/delete', async (req, res, next) => {
  try {
    res.json(await softDeleteInvoices(req.body.ids || []));
  } catch (error) {
    next(error);
  }
});

app.post('/api/invoices/restore', async (req, res, next) => {
  try {
    res.json(await restoreInvoices(req.body.ids || []));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/invoices', async (req, res, next) => {
  try {
    res.json(await permanentlyDeleteInvoices(req.body.ids || []));
  } catch (error) {
    next(error);
  }
});

app.post('/api/extract', async (req, res, next) => {
  try {
    const { fileBase64, mimeType, userPrompt } = req.body;
    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: 'fileBase64 and mimeType are required' });
    }
    res.json(await extractDocumentData(fileBase64, mimeType, userPrompt));
  } catch (error) {
    next(error);
  }
});

const distPath = path.resolve(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Server error' });
});

ensureDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Invoice demo server listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
