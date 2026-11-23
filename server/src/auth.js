import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

/** JWT signing secret: JWT_SECRET env var, else a random one generated once and kept next to the data file. */
export function loadSecret(dataDir) {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(dataDir, 'jwt.secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export function signToken(user, secret) {
  // Fractional `iat` lets us compare against the exact moment a password was changed.
  return jwt.sign({ sub: user.id, role: user.role, iat: Date.now() / 1000 }, secret, { expiresIn: '8h' });
}

/** Requires a valid Bearer token belonging to an active account. Sets req.user. */
export function authenticate(store, secret) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Please log in to continue' });
    try {
      const payload = jwt.verify(token, secret);
      const user = store.get(payload.sub);
      const changedAt = user?.passwordChangedAt ? Date.parse(user.passwordChangedAt) : 0;
      if (!user || user.status !== 'active' || user.role !== payload.role || payload.iat * 1000 < changedAt) {
        throw new Error('invalid session');
      }
      req.user = user;
      return next();
    } catch {
      return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    }
  };
}

export const isFaculty = (u) => u?.role === 'staff' && u.staffRole !== 'placement';
export const isPlacementCoordinator = (u) => u?.role === 'staff' && u.staffRole === 'placement';
export const isAdmin = (u) => u?.role === 'admin';
/** Administrator, or department staff: may manage people (within their department for staff). */
export const canManagePeople = (u) => isAdmin(u) || isFaculty(u);

export function requireManager(req, res, next) {
  if (canManagePeople(req.user)) return next();
  return res.status(403).json({ error: 'This action is available to the administrator and department staff only' });
}

export function requireAdmin(req, res, next) {
  if (isAdmin(req.user)) return next();
  return res.status(403).json({ error: 'This action is available to the administrator only' });
}

/** Department staff (name.DEPT@kongu.edu). Scope: their own department only. */
export function requireFaculty(req, res, next) {
  if (isFaculty(req.user)) return next();
  return res.status(403).json({ error: 'This action is available to department staff only' });
}

/** Placement coordinators (placement.DEPT@kongu.edu). */
export function requireCoordinator(req, res, next) {
  if (isPlacementCoordinator(req.user)) return next();
  return res.status(403).json({ error: 'This action is available to the placement coordinator only' });
}

export function requireStudent(req, res, next) {
  if (req.user?.role === 'student') return next();
  return res.status(403).json({ error: 'This action is available to students only' });
}

/** Simple in-memory limiter for failed logins (per IP + email). */
export function createLimiter({ max = 8, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map();
  const entry = (key) => {
    const e = hits.get(key);
    if (e && e.resetAt > Date.now()) return e;
    hits.delete(key);
    return null;
  };
  return {
    blocked: (key) => (entry(key)?.count ?? 0) >= max,
    fail: (key) => {
      const e = entry(key) || { count: 0, resetAt: Date.now() + windowMs };
      e.count++;
      hits.set(key, e);
    },
    reset: (key) => hits.delete(key),
  };
}
