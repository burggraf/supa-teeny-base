-- 001_tasks.sql
-- Tasks table for the Supaflare Demo app

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'todo',
  due_date TEXT,
  user_id TEXT NOT NULL DEFAULT 'demo-user',
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);

-- RLS Policies (optional - for DATA.md Phase 1F demonstration)
-- Uncomment to enable row-level security:
-- INSERT INTO rls_policies (id, table_name, name, role, operation, using_expr, permissive)
-- VALUES ('tasks-owner-select', 'tasks', 'owner_can_read', 'authenticated', 'SELECT', 'user_id == auth.uid()', 1);
-- INSERT INTO rls_policies (id, table_name, name, role, operation, using_expr, permissive)
-- VALUES ('tasks-owner-write', 'tasks', 'owner_can_write', 'authenticated', 'ALL', 'user_id == auth.uid()', 1);
