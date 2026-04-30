CREATE TABLE IF NOT EXISTS instruments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
INSERT OR REPLACE INTO instruments (id, name) VALUES (1, 'harpsichord');
