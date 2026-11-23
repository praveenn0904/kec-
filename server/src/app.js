import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { loadSecret, authenticate, requireFaculty, createLimiter } from './auth.js';
import { DEPARTMENTS, PERIODS, SECTIONS } from './departments.js';
import { isDate } from './validate.js';
import { SEED_PASSWORDS } from './seed.js';
import { authRouter } from './routes/auth.js';
import { timetableRouter } from './routes/timetable.js';
import { catRouter } from './routes/cat.js';
import { contactsRouter } from './routes/contacts.js';
import { attendanceRouter } from './routes/attendance.js';
import { onDutyRouter } from './routes/onduty.js';
import { placementsRouter } from './routes/placements.js';
import { collegeToday } from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

export function createApp({ store = new Store(), secret, limiter = createLimiter() } = {}) {
  const jwtSecret = secret || loadSecret(path.dirname(store.file));
  const auth = authenticate(store, jwtSecret);

  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  // Only the on-duty application carries a file (base64 in JSON), so only it gets the larger body limit.
  const smallJson = express.json({ limit: '100kb' });
  const proofJson = express.json({ limit: '3.5mb' });
  app.use((req, res, next) => (req.method === 'POST' && req.path === '/api/onduty' ? proofJson : smallJson)(req, res, next));

  const api = express.Router();

  api.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Public: the register page needs the department list, the login page may show demo accounts.
  api.get('/meta', (_req, res) => {
    const showDemo = store.demo && process.env.DEMO_ACCOUNTS !== 'off';
    res.json({
      departments: DEPARTMENTS,
      sections: SECTIONS,
      periods: PERIODS,
      demoAccounts: showDemo
        ? {
            student: { email: 'aarav.sharma@kongu.edu', password: SEED_PASSWORDS.student },
            staff: { email: 'meera.cse@kongu.edu', password: SEED_PASSWORDS.staff },
            placement: { email: 'placement.cse@kongu.edu', password: SEED_PASSWORDS.staff },
          }
        : null,
      // Shown on the login page only when no demo data is loaded.
    });
  });

  api.use('/auth', authRouter({ store, secret: jwtSecret, auth, limiter }));

  // Figures for the signed-in department staff member's own department.
  api.get('/stats', auth, requireFaculty, (req, res) => {
    const today = isDate(req.query.today) ? req.query.today : collegeToday();
    res.json(store.stats(today, req.user.department));
  });

  api.use('/contacts', auth, contactsRouter({ store }));
  api.use('/attendance', auth, attendanceRouter({ store }));
  api.use('/timetable', auth, timetableRouter({ store }));
  api.use('/cat', auth, catRouter({ store }));
  api.use('/onduty', auth, onDutyRouter({ store }));
  api.use('/placements', auth, placementsRouter({ store }));
  api.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/api', api);

  // Serve the built React app in production.
  const dist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large' });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
