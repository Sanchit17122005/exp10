import { hashPassword } from './auth.js';
import { queries } from './db.js';

const users = [
  ['Maya Chen', 'maya@example.com', 'password123', 'Product engineer writing about resilient teams.'],
  ['Arjun Mehta', 'arjun@example.com', 'password123', 'Backend developer focused on databases and APIs.']
];

const createdUsers = users.map(([name, email, password, bio]) => {
  const existing = queries.findUserByEmail.get(email);
  if (existing) return existing;
  return queries.createUser.get(name, email, hashPassword(password), bio);
});

if (queries.listPosts.all().length === 0) {
  const firstPost = queries.createPost.get(
    'Designing a Blog Platform with Relational Data',
    'A practical blog system starts with clear ownership boundaries. Users own posts, posts collect comments, and each comment keeps a durable link to both the author and the post. That shape gives the API enough structure to protect edits while still keeping the reading experience open.',
    createdUsers[0].id
  );
  const secondPost = queries.createPost.get(
    'Why Real-Time Comments Change the Feel of a Page',
    'Real-time updates are small, but they make collaborative pages feel alive. Server-Sent Events are a good fit when the browser mostly needs to receive updates and the normal API can still handle writes.',
    createdUsers[1].id
  );
  queries.createComment.get('The ownership model keeps the permissions easy to reason about.', firstPost.id, createdUsers[1].id);
  queries.createComment.get('SSE is a nice match here because comments only need one-way updates.', secondPost.id, createdUsers[0].id);
}

console.log('Seeded demo users: maya@example.com / password123 and arjun@example.com / password123');
