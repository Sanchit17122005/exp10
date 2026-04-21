import { createServer } from 'node:http';
import { extname, join, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hashPassword, signToken, verifyPassword, verifyToken } from './auth.js';
import { queries } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const port = Number(process.env.PORT || 4000);
const commentStreams = new Map();

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res, status, message) {
  send(res, status, { error: message });
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    bio: user.bio,
    createdAt: user.created_at || user.createdAt
  };
}

function authenticate(req) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload?.sub) return null;
  return queries.findUserById.get(payload.sub);
}

function requireAuth(req, res) {
  const user = authenticate(req);
  if (!user) sendError(res, 401, 'Authentication required');
  return user;
}

function validateText(value, label, min = 1) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min) return `${label} is required`;
  return null;
}

function broadcastComment(postId, comment) {
  const streams = commentStreams.get(String(postId));
  if (!streams) return;
  const payload = `event: comment\n`;
  const data = `data: ${JSON.stringify(comment)}\n\n`;
  for (const stream of streams) stream.write(payload + data);
}

function addCommentStream(postId, res) {
  const key = String(postId);
  if (!commentStreams.has(key)) commentStreams.set(key, new Set());
  commentStreams.get(key).add(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write('event: ready\ndata: {}\n\n');
}

function removeCommentStream(postId, res) {
  const key = String(postId);
  const streams = commentStreams.get(key);
  if (!streams) return;
  streams.delete(res);
  if (streams.size === 0) commentStreams.delete(key);
}

function serveStatic(req, res) {
  const distPath = join(rootDir, 'dist', req.url === '/' ? 'index.html' : req.url);
  const indexPath = join(rootDir, 'dist', 'index.html');
  const filePath = existsSync(distPath) ? distPath : indexPath;

  if (!existsSync(filePath)) {
    sendError(res, 404, 'Run npm run build to serve the production frontend, or npm run dev for Vite.');
    return;
  }

  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg'
  };
  res.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream' });
  res.end(readFileSync(filePath));
}

async function handleApi(req, res, url) {
  const method = req.method;
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    if (method === 'POST' && url.pathname === '/api/auth/signup') {
      const body = await readJson(req);
      if (!body) return sendError(res, 400, 'Invalid JSON');
      const required = validateText(body.name, 'Name') || validateText(body.email, 'Email') || validateText(body.password, 'Password', 8);
      if (required) return sendError(res, 400, required);

      try {
        const user = queries.createUser.get(body.name.trim(), body.email.trim().toLowerCase(), hashPassword(body.password), body.bio?.trim() || '');
        return send(res, 201, { user: publicUser(user), token: signToken(user) });
      } catch (error) {
        if (String(error.message).includes('UNIQUE')) return sendError(res, 409, 'Email is already registered');
        throw error;
      }
    }

    if (method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readJson(req);
      if (!body) return sendError(res, 400, 'Invalid JSON');
      const user = queries.findUserByEmail.get(body.email?.trim().toLowerCase() || '');
      if (!user || !verifyPassword(body.password || '', user.password_hash)) return sendError(res, 401, 'Invalid email or password');
      return send(res, 200, { user: publicUser(user), token: signToken(user) });
    }

    if (method === 'GET' && url.pathname === '/api/auth/me') {
      const user = requireAuth(req, res);
      if (!user) return;
      return send(res, 200, { user: publicUser(user) });
    }

    if (method === 'PUT' && url.pathname === '/api/profile') {
      const user = requireAuth(req, res);
      if (!user) return;
      const body = await readJson(req);
      if (!body) return sendError(res, 400, 'Invalid JSON');
      const error = validateText(body.name, 'Name');
      if (error) return sendError(res, 400, error);
      const updated = queries.updateUser.get(body.name.trim(), body.bio?.trim() || '', user.id);
      return send(res, 200, { user: publicUser(updated) });
    }

    if (method === 'GET' && url.pathname === '/api/posts') {
      return send(res, 200, { posts: queries.listPosts.all() });
    }

    if (method === 'POST' && url.pathname === '/api/posts') {
      const user = requireAuth(req, res);
      if (!user) return;
      const body = await readJson(req);
      if (!body) return sendError(res, 400, 'Invalid JSON');
      const error = validateText(body.title, 'Title') || validateText(body.body, 'Post body', 20);
      if (error) return sendError(res, 400, error);
      const created = queries.createPost.get(body.title.trim(), body.body.trim(), user.id);
      return send(res, 201, { post: queries.getPost.get(created.id) });
    }

    if (parts[0] === 'api' && parts[1] === 'posts' && parts[2]) {
      const postId = Number(parts[2]);
      if (!Number.isInteger(postId)) return sendError(res, 400, 'Invalid post id');

      if (method === 'GET' && parts.length === 3) {
        const post = queries.getPost.get(postId);
        if (!post) return sendError(res, 404, 'Post not found');
        return send(res, 200, { post, comments: queries.listComments.all(postId) });
      }

      if (method === 'PUT' && parts.length === 3) {
        const user = requireAuth(req, res);
        if (!user) return;
        const body = await readJson(req);
        if (!body) return sendError(res, 400, 'Invalid JSON');
        const error = validateText(body.title, 'Title') || validateText(body.body, 'Post body', 20);
        if (error) return sendError(res, 400, error);
        const updated = queries.updatePost.get(body.title.trim(), body.body.trim(), postId, user.id);
        if (!updated) return sendError(res, 403, 'Only the author can edit this post');
        return send(res, 200, { post: queries.getPost.get(postId) });
      }

      if (method === 'DELETE' && parts.length === 3) {
        const user = requireAuth(req, res);
        if (!user) return;
        const result = queries.deletePost.run(postId, user.id);
        if (result.changes === 0) return sendError(res, 403, 'Only the author can delete this post');
        return send(res, 200, { ok: true });
      }

      if (method === 'GET' && parts[3] === 'comments' && parts[4] === 'stream') {
        if (!queries.getPost.get(postId)) return sendError(res, 404, 'Post not found');
        addCommentStream(postId, res);
        req.on('close', () => removeCommentStream(postId, res));
        return;
      }

      if (method === 'GET' && parts[3] === 'comments') {
        return send(res, 200, { comments: queries.listComments.all(postId) });
      }

      if (method === 'POST' && parts[3] === 'comments') {
        const user = requireAuth(req, res);
        if (!user) return;
        if (!queries.getPost.get(postId)) return sendError(res, 404, 'Post not found');
        const body = await readJson(req);
        if (!body) return sendError(res, 400, 'Invalid JSON');
        const error = validateText(body.body, 'Comment');
        if (error) return sendError(res, 400, error);
        const created = queries.createComment.get(body.body.trim(), postId, user.id);
        const comment = queries.listComments.all(postId).find((item) => item.id === created.id);
        broadcastComment(postId, comment);
        return send(res, 201, { comment });
      }
    }

    if (method === 'DELETE' && parts[0] === 'api' && parts[1] === 'comments' && parts[2]) {
      const user = requireAuth(req, res);
      if (!user) return;
      const result = queries.deleteComment.run(Number(parts[2]), user.id);
      if (result.changes === 0) return sendError(res, 403, 'Only the author can delete this comment');
      return send(res, 200, { ok: true });
    }

    sendError(res, 404, 'Route not found');
  } catch (error) {
    console.error(error);
    sendError(res, 500, 'Internal server error');
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api')) {
    handleApi(req, res, url);
    return;
  }
  serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
