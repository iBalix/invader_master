CREATE TABLE IF NOT EXISTS bar_action_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  machine_name TEXT NOT NULL,
  action_label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bar_action_logs_machine ON bar_action_logs (machine_name);
CREATE INDEX idx_bar_action_logs_created ON bar_action_logs (created_at DESC);
