import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { signToken } from '../auth.js';
import { validateContact, validatePassword } from '../validate.js';
import { viewFor, DUPLICATE_MESSAGES } from '../views.js';

const LOGIN_LABEL = { staff: 'Staff', student: 'Student', admin: 'Administrator' };

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1', 10);

export function authRouter({ store, secret, auth, limiter }) {
  const r = Router();

  r.post('/login', async (req, res) => {
    const { role, email, password } = req.body || {};
    const key = `${req.ip}|${String(email || '').toLowerCase()}`;
    if (limiter.blocked(key)) {
      return res.status(429).json({ error: 'Too many failed attempts. Please try again in a few minutes.' });
    }

    const user = typeof email === 'string' ? store.getByEmail(email) : null;
    const matches = typeof password === 'string' && (await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH));
    if (!user || !user.passwordHash || !matches) {
      limiter.fail(key);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (role && user.role !== role) {
      return res.status(403).json({
        error: `This is a ${user.role} account. Please use the ${LOGIN_LABEL[user.role] || 'Student'} login.`,
      });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Your account is inactive. Please contact the college administration.' });
    }

    limiter.reset(key);
    return res.json({ token: signToken(user, secret), user: viewFor(user, user) });
  });

  // Students can create their own account. Staff accounts are created by existing staff only.
  r.post('/register', async (req, res) => {
    const { errors, value } = validateContact({ ...req.body, role: 'student', status: 'active' });
    const pwError = validatePassword(req.body?.password);
    if (pwError) errors.password = pwError;
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });

    const dup = store.findDuplicate(value);
    if (dup) {
      return res.status(409).json({
        error: 'Account already exists',
        fields: { [dup.field]: DUPLICATE_MESSAGES[dup.field] },
      });
    }

    const passwordHash = await bcrypt.hash(req.body.password, 10);
    const user = store.create({ ...value, notes: '', passwordHash, passwordChangedAt: new Date().toISOString() });
    return res.status(201).json({ token: signToken(user, secret), user: viewFor(user, user) });
  });

  r.get('/me', auth, (req, res) => res.json(viewFor(req.user, req.user)));

  r.post('/change-password', auth, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const ok = typeof currentPassword === 'string' && (await bcrypt.compare(currentPassword, req.user.passwordHash));
    if (!ok) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: { currentPassword: 'Current password is incorrect' } });
    const pwError = validatePassword(newPassword);
    if (pwError) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: { newPassword: pwError } });

    const updated = store.update(req.user.id, {
      ...req.user,
      passwordHash: await bcrypt.hash(newPassword, 10),
      passwordChangedAt: new Date().toISOString(),
    });
    // Every older token stops working; hand back a fresh one for this device.
    return res.json({ token: signToken(updated, secret) });
  });

  return r;
}
