import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const tokenKey = 'blog_platform_token';

async function api(path, options = {}) {
  const token = localStorage.getItem(tokenKey);
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function AuthPanel({ onAuthed }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', bio: '' });
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const data = await api(endpoint, { method: 'POST', body: JSON.stringify(form) });
      localStorage.setItem(tokenKey, data.token);
      onAuthed(data.user);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="panel auth-panel">
      <div className="panel-header">
        <h2>{mode === 'login' ? 'Sign in' : 'Create profile'}</h2>
        <div className="segmented">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Sign up</button>
        </div>
      </div>
      <form onSubmit={submit} className="form">
        {mode === 'signup' && (
          <label>
            Name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
        )}
        <label>
          Email
          <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        </label>
        <label>
          Password
          <input type="password" minLength="8" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
        </label>
        {mode === 'signup' && (
          <label>
            Bio
            <textarea value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit">{mode === 'login' ? 'Sign in' : 'Create account'}</button>
      </form>
    </section>
  );
}

function ProfilePanel({ user, onUpdated, onLogout }) {
  const [form, setForm] = useState({ name: user.name, bio: user.bio || '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    setForm({ name: user.name, bio: user.bio || '' });
  }, [user]);

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');
    try {
      const data = await api('/api/profile', { method: 'PUT', body: JSON.stringify(form) });
      onUpdated(data.user);
      setMessage('Profile saved');
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Profile</h2>
        <button className="ghost" onClick={onLogout}>Sign out</button>
      </div>
      <form onSubmit={submit} className="form">
        <label>
          Name
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </label>
        <label>
          Bio
          <textarea value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} />
        </label>
        {message && <p className={message.includes('saved') ? 'success' : 'error'}>{message}</p>}
        <button className="primary" type="submit">Save profile</button>
      </form>
    </section>
  );
}

function PostForm({ user, activePost, onSaved, onCancel }) {
  const [form, setForm] = useState({ title: '', body: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(activePost ? { title: activePost.title, body: activePost.body } : { title: '', body: '' });
    setError('');
  }, [activePost]);

  if (!user) {
    return (
      <section className="panel">
        <h2>Write</h2>
        <p className="muted">Sign in to publish posts and join discussions.</p>
      </section>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const path = activePost ? `/api/posts/${activePost.id}` : '/api/posts';
      const method = activePost ? 'PUT' : 'POST';
      const data = await api(path, { method, body: JSON.stringify(form) });
      onSaved(data.post);
      if (!activePost) setForm({ title: '', body: '' });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="panel composer">
      <div className="panel-header">
        <h2>{activePost ? 'Edit post' : 'Write post'}</h2>
        {activePost && <button className="ghost" onClick={onCancel}>Cancel</button>}
      </div>
      <form onSubmit={submit} className="form">
        <label>
          Title
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
        </label>
        <label>
          Body
          <textarea className="post-body-input" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit">{activePost ? 'Update post' : 'Publish post'}</button>
      </form>
    </section>
  );
}

function PostList({ posts, selectedId, onSelect }) {
  return (
    <section className="post-list" aria-label="Posts">
      {posts.map((post) => (
        <button key={post.id} className={`post-card ${selectedId === post.id ? 'selected' : ''}`} onClick={() => onSelect(post.id)}>
          <span className="meta">{post.authorName} · {formatDate(post.createdAt)}</span>
          <strong>{post.title}</strong>
          <span>{post.body.slice(0, 145)}{post.body.length > 145 ? '...' : ''}</span>
          <small>{post.commentCount} comment{post.commentCount === 1 ? '' : 's'}</small>
        </button>
      ))}
    </section>
  );
}

function Comments({ postId, comments, setComments, user }) {
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!postId) return undefined;
    const events = new EventSource(`/api/posts/${postId}/comments/stream`);
    events.addEventListener('comment', (event) => {
      const comment = JSON.parse(event.data);
      setComments((current) => current.some((item) => item.id === comment.id) ? current : [...current, comment]);
    });
    return () => events.close();
  }, [postId, setComments]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const data = await api(`/api/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
      setComments((current) => current.some((item) => item.id === data.comment.id) ? current : [...current, data.comment]);
      setBody('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="comments">
      <h3>Comments</h3>
      <div className="comment-stack">
        {comments.length === 0 && <p className="muted">No comments yet.</p>}
        {comments.map((comment) => (
          <article className="comment" key={comment.id}>
            <div>
              <strong>{comment.authorName}</strong>
              <span>{formatDate(comment.createdAt)}</span>
            </div>
            <p>{comment.body}</p>
          </article>
        ))}
      </div>
      {user ? (
        <form onSubmit={submit} className="comment-form">
          <input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add a comment" required />
          <button className="primary" type="submit">Post</button>
          {error && <p className="error">{error}</p>}
        </form>
      ) : (
        <p className="muted">Sign in to comment.</p>
      )}
    </section>
  );
}

function PostDetail({ post, comments, setComments, user, onEdit, onDeleted }) {
  const [error, setError] = useState('');
  if (!post) {
    return (
      <section className="reader empty-state">
        <h2>No posts yet</h2>
        <p>Create the first post after signing in.</p>
      </section>
    );
  }

  const canEdit = user?.id === post.authorId;
  const deletePost = async () => {
    setError('');
    try {
      await api(`/api/posts/${post.id}`, { method: 'DELETE' });
      onDeleted(post.id);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="reader">
      <div className="reader-heading">
        <div>
          <span className="meta">{post.authorName} · {formatDate(post.createdAt)}</span>
          <h1>{post.title}</h1>
          {post.authorBio && <p className="author-bio">{post.authorBio}</p>}
        </div>
        {canEdit && (
          <div className="actions">
            <button className="ghost" onClick={() => onEdit(post)}>Edit</button>
            <button className="danger" onClick={deletePost}>Delete</button>
          </div>
        )}
      </div>
      <div className="post-content">
        {post.body.split('\n').map((line, index) => <p key={index}>{line}</p>)}
      </div>
      {error && <p className="error">{error}</p>}
      <Comments postId={post.id} comments={comments} setComments={setComments} user={user} />
    </section>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [comments, setComments] = useState([]);
  const [editingPost, setEditingPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const selectedPost = useMemo(() => posts.find((post) => post.id === selectedId) || posts[0] || null, [posts, selectedId]);

  const loadPosts = async () => {
    const data = await api('/api/posts');
    setPosts(data.posts);
    setSelectedId((current) => current || data.posts[0]?.id || null);
  };

  useEffect(() => {
    const boot = async () => {
      try {
        if (localStorage.getItem(tokenKey)) {
          const data = await api('/api/auth/me');
          setUser(data.user);
        }
      } catch {
        localStorage.removeItem(tokenKey);
      }
      try {
        await loadPosts();
      } catch (err) {
        setNotice(err.message);
      }
      setLoading(false);
    };
    boot();
  }, []);

  useEffect(() => {
    if (!selectedPost) {
      setComments([]);
      return;
    }
    api(`/api/posts/${selectedPost.id}`)
      .then((data) => setComments(data.comments))
      .catch((err) => setNotice(err.message));
  }, [selectedPost?.id]);

  const handleSaved = async (post) => {
    await loadPosts();
    setSelectedId(post.id);
    setEditingPost(null);
  };

  const handleDeleted = (postId) => {
    const nextPosts = posts.filter((post) => post.id !== postId);
    setPosts(nextPosts);
    setSelectedId(nextPosts[0]?.id || null);
    setEditingPost(null);
  };

  const logout = () => {
    localStorage.removeItem(tokenKey);
    setUser(null);
  };

  return (
    <main>
      <header className="topbar">
        <div>
          <span className="eyebrow">Full-stack blog platform</span>
          <h1>Signal Notes</h1>
        </div>
        <span className="session">{user ? `Signed in as ${user.name}` : 'Browsing as guest'}</span>
      </header>

      {notice && <p className="notice">{notice}</p>}

      <div className="layout">
        <aside className="sidebar">
          {user ? <ProfilePanel user={user} onUpdated={setUser} onLogout={logout} /> : <AuthPanel onAuthed={setUser} />}
          <PostForm user={user} activePost={editingPost} onSaved={handleSaved} onCancel={() => setEditingPost(null)} />
        </aside>

        <section className="content">
          {loading ? (
            <section className="reader empty-state"><h2>Loading posts</h2></section>
          ) : (
            <>
              <PostList posts={posts} selectedId={selectedPost?.id} onSelect={(id) => { setSelectedId(id); setEditingPost(null); }} />
              <PostDetail post={selectedPost} comments={comments} setComments={setComments} user={user} onEdit={setEditingPost} onDeleted={handleDeleted} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
