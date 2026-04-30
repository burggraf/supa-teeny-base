CREATE TABLE IF NOT EXISTS texts (
  id INTEGER PRIMARY KEY,
  content TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS texts_fts USING fts5(content, content_rowid=id);
