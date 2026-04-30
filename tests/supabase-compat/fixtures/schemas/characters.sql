CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
INSERT OR REPLACE INTO characters (id, name) VALUES (1, 'Luke'), (2, 'Leia'), (3, 'Han');
