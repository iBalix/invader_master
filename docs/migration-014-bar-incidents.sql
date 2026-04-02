-- Migration 014: Table for bar machine incident reporting
-- Tracks incidents reported on tables, bornes, bars, TVs, etc.

CREATE TABLE bar_incidents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  machine_name TEXT NOT NULL,
  machine_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  description TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_bar_incidents_machine ON bar_incidents(machine_name);
CREATE INDEX idx_bar_incidents_resolved ON bar_incidents(resolved);
