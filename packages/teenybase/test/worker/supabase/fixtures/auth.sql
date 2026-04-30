-- Pre-seeded auth user with known bcrypt password: "test-password-123"
-- Hash: $2b$10$UGbGYEJ0W3CU3zcQ.on1KOehUyqeESDHah4dUa0bwrwQvu4BoumuG

INSERT OR IGNORE INTO auth_users (
  id, email, encrypted_password, email_confirmed_at, role,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'test@example.com',
  '$2b$10$UGbGYEJ0W3CU3zcQ.on1KOehUyqeESDHah4dUa0bwrwQvu4BoumuG',
  '2026-01-01T00:00:00Z',
  'authenticated',
  '{"provider":"email","providers":["email"]}',
  '{}',
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z'
);

-- Pre-seeded auth user with unconfirmed email
INSERT OR IGNORE INTO auth_users (
  id, email, encrypted_password, email_confirmed_at, role,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  'unconfirmed@example.com',
  '$2b$10$UGbGYEJ0W3CU3zcQ.on1KOehUyqeESDHah4dUa0bwrwQvu4BoumuG',
  NULL,
  'authenticated',
  '{"provider":"email","providers":["email"]}',
  '{}',
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z'
);
