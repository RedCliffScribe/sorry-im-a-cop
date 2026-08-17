ALTER TABLE workshop_items
  ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0
  CHECK(download_count >= 0);
