-- Mentor-assigned tasks for users
-- Run this migration in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS mentor_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  due_date DATE,
  source_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  source_mode TEXT,
  source_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS mentor_tasks_user_id_idx ON mentor_tasks(user_id);
CREATE INDEX IF NOT EXISTS mentor_tasks_user_status_idx ON mentor_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS mentor_tasks_due_date_idx ON mentor_tasks(user_id, due_date) WHERE status = 'open';
