import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

const SERVICE_KEY = 'sb-service-test-key';
const ANON_KEY = 'sb-anon-test-key';

async function getAdminToken() {
  // Signup + signin to get a session, but admin routes need service_role key in apikey header
  return SERVICE_KEY;
}

describe('POST /auth/v1/admin/users', () => {
  it('creates user with service_role key', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        email: 'admin-created@example.com',
        password: 'admin-password-123',
        email_confirm: true,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.email).toBe('admin-created@example.com');
    expect(data.role).toBe('authenticated');
  });

  it('creates user with user_metadata', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        email: 'meta-admin@example.com',
        password: 'admin-password-123',
        email_confirm: true,
        user_metadata: { role: 'editor', team: 'dev' },
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user_metadata.role).toBe('editor');
    expect(data.user_metadata.team).toBe('dev');
  });

  it('rejects without service_role key', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
      },
      body: JSON.stringify({
        email: 'forbidden@example.com',
        password: 'password-123',
      }),
    });

    expect(res.status).toBe(403);
  });

  it('rejects weak password', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        email: 'weak-admin@example.com',
        password: 'short',
      }),
    });

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.code).toBe('weak_password');
  });

  it('rejects duplicate email', async () => {
    // First create
    await SELF.fetch('http://localhost/auth/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        email: 'dup-admin@example.com',
        password: 'admin-password-123',
        email_confirm: true,
      }),
    });

    // Second create with same email
    const res = await SELF.fetch('http://localhost/auth/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        email: 'dup-admin@example.com',
        password: 'another-password',
      }),
    });

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.code).toBe('user_already_exists');
  });
});

describe('GET /auth/v1/admin/users', () => {
  it('lists users paginated', async () => {
    // Create a few users first
    for (let i = 0; i < 3; i++) {
      await SELF.fetch('http://localhost/auth/v1/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SERVICE_KEY,
        },
        body: JSON.stringify({
          email: `list-${i}@example.com`,
          password: 'admin-password-123',
          email_confirm: true,
        }),
      });
    }

    const res = await SELF.fetch('http://localhost/auth/v1/admin/users?page=1&per_page=10', {
      headers: { apikey: SERVICE_KEY },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.users).toBeDefined();
    expect(Array.isArray(data.users)).toBe(true);
    expect(data.total_count).toBeGreaterThan(0);
  });

  it('rejects without service_role', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/admin/users', {
      headers: { apikey: ANON_KEY },
    });

    expect(res.status).toBe(403);
  });
});

describe('GET /auth/v1/admin/users/:uid', () => {
  it('gets user by ID', async () => {
    // Create user first
    const createRes = await SELF.fetch('http://localhost/auth/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        email: 'get-user@example.com',
        password: 'admin-password-123',
        email_confirm: true,
      }),
    });
    const created = await createRes.json();

    const res = await SELF.fetch(`http://localhost/auth/v1/admin/users/${created.id}`, {
      headers: { apikey: SERVICE_KEY },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.email).toBe('get-user@example.com');
  });

  it('returns 404 for non-existent user', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/admin/users/nonexistent-id', {
      headers: { apikey: SERVICE_KEY },
    });

    expect(res.status).toBe(404);
  });
});

describe('PUT /auth/v1/admin/users/:uid', () => {
  it('updates user email', async () => {
    const createRes = await SELF.fetch('http://localhost/auth/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        email: 'update-me@example.com',
        password: 'admin-password-123',
        email_confirm: true,
      }),
    });
    const created = await createRes.json();

    const res = await SELF.fetch(`http://localhost/auth/v1/admin/users/${created.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({ email: 'updated@example.com' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.email).toBe('updated@example.com');
  });

  it('updates user metadata', async () => {
    const createRes = await SELF.fetch('http://localhost/auth/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        email: 'meta-update@example.com',
        password: 'admin-password-123',
        email_confirm: true,
      }),
    });
    const created = await createRes.json();

    const res = await SELF.fetch(`http://localhost/auth/v1/admin/users/${created.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({ user_metadata: { premium: true, level: 5 } }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user_metadata.premium).toBe(true);
    expect(data.user_metadata.level).toBe(5);
  });

  it('bans a user', async () => {
    const createRes = await SELF.fetch('http://localhost/auth/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        email: 'ban-me@example.com',
        password: 'admin-password-123',
        email_confirm: true,
      }),
    });
    const created = await createRes.json();

    const res = await SELF.fetch(`http://localhost/auth/v1/admin/users/${created.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({ banned_until: '2099-01-01T00:00:00Z' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.banned_until).toBe('2099-01-01T00:00:00Z');
  });
});

describe('DELETE /auth/v1/admin/users/:uid', () => {
  it('soft deletes a user', async () => {
    const createRes = await SELF.fetch('http://localhost/auth/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        email: 'delete-me@example.com',
        password: 'admin-password-123',
        email_confirm: true,
      }),
    });
    const created = await createRes.json();

    const res = await SELF.fetch(`http://localhost/auth/v1/admin/users/${created.id}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_KEY },
    });

    expect(res.status).toBe(200);

    // User should not be findable
    const getRes = await SELF.fetch(`http://localhost/auth/v1/admin/users/${created.id}`, {
      headers: { apikey: SERVICE_KEY },
    });
    expect(getRes.status).toBe(404);
  });
});

describe('POST /auth/v1/admin/generate_link', () => {
  it('generates a signup link', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/admin/generate_link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        type: 'signup',
        email: 'link-signup@example.com',
        password: 'admin-password-123',
        redirect_to: 'http://localhost:3000/callback',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action_link).toContain('/auth/v1/verify');
    expect(data.email_otp).toBeDefined();
    expect(data.hashed_token).toBeDefined();
    expect(data.verification_type).toBe('signup');
    expect(data.user.email).toBe('link-signup@example.com');
  });

  it('generates a magiclink', async () => {
    // Create user first
    await SELF.fetch('http://localhost/auth/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        email: 'magic-user@example.com',
        password: 'admin-password-123',
        email_confirm: true,
      }),
    });

    const res = await SELF.fetch('http://localhost/auth/v1/admin/generate_link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        type: 'magiclink',
        email: 'magic-user@example.com',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.verification_type).toBe('magiclink');
    expect(data.action_link).toContain('type=magiclink');
  });

  it('rejects without service_role', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/admin/generate_link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
      },
      body: JSON.stringify({
        type: 'signup',
        email: 'forbidden@example.com',
        password: 'password-123',
      }),
    });

    expect(res.status).toBe(403);
  });
});
