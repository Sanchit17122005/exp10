import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'blog.sqlite'));
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    author_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    body TEXT NOT NULL,
    post_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

export const queries = {
  createUser: db.prepare(`
    INSERT INTO users (name, email, password_hash, bio)
    VALUES (?, ?, ?, ?)
    RETURNING id, name, email, bio, created_at
  `),
  findUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  findUserById: db.prepare('SELECT id, name, email, bio, created_at FROM users WHERE id = ?'),
  updateUser: db.prepare(`
    UPDATE users SET name = ?, bio = ? WHERE id = ?
    RETURNING id, name, email, bio, created_at
  `),
  listPosts: db.prepare(`
    SELECT
      posts.id,
      posts.title,
      posts.body,
      posts.author_id AS authorId,
      posts.created_at AS createdAt,
      posts.updated_at AS updatedAt,
      users.name AS authorName,
      users.bio AS authorBio,
      COUNT(comments.id) AS commentCount
    FROM posts
    JOIN users ON users.id = posts.author_id
    LEFT JOIN comments ON comments.post_id = posts.id
    GROUP BY posts.id
    ORDER BY posts.created_at DESC
  `),
  getPost: db.prepare(`
    SELECT
      posts.id,
      posts.title,
      posts.body,
      posts.author_id AS authorId,
      posts.created_at AS createdAt,
      posts.updated_at AS updatedAt,
      users.name AS authorName,
      users.bio AS authorBio,
      COUNT(comments.id) AS commentCount
    FROM posts
    JOIN users ON users.id = posts.author_id
    LEFT JOIN comments ON comments.post_id = posts.id
    WHERE posts.id = ?
    GROUP BY posts.id
  `),
  createPost: db.prepare(`
    INSERT INTO posts (title, body, author_id) VALUES (?, ?, ?)
    RETURNING id
  `),
  updatePost: db.prepare(`
    UPDATE posts
    SET title = ?, body = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND author_id = ?
    RETURNING id
  `),
  deletePost: db.prepare('DELETE FROM posts WHERE id = ? AND author_id = ?'),
  listComments: db.prepare(`
    SELECT
      comments.id,
      comments.body,
      comments.post_id AS postId,
      comments.author_id AS authorId,
      comments.created_at AS createdAt,
      users.name AS authorName
    FROM comments
    JOIN users ON users.id = comments.author_id
    WHERE comments.post_id = ?
    ORDER BY comments.created_at ASC, comments.id ASC
  `),
  createComment: db.prepare(`
    INSERT INTO comments (body, post_id, author_id) VALUES (?, ?, ?)
    RETURNING id
  `),
  deleteComment: db.prepare('DELETE FROM comments WHERE id = ? AND author_id = ?')
};
