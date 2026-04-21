import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const secret = process.env.JWT_SECRET || 'dev-secret-change-before-production';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const decode = (value) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const actual = Buffer.from(hash, 'hex');
  const candidate = scryptSync(password, salt, 64);
  return actual.length === candidate.length && timingSafeEqual(actual, candidate);
}

export function signToken(user) {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    sub: user.id,
    email: user.email,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
  });
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token) {
  const [header, payload, signature] = token?.split('.') || [];
  if (!header || !payload || !signature) return null;

  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  const data = decode(payload);
  if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
  return data;
}
