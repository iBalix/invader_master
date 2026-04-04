-- Migration 016: Labels personnalisables pour les machines du bar

CREATE TABLE IF NOT EXISTS machine_labels (
  machine_name TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  technical_name TEXT NOT NULL DEFAULT ''
);
