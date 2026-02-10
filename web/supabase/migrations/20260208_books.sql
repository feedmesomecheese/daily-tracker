-- Books table for tracking reading
CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core info (can be auto-populated from Open Library)
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  pages INTEGER,
  genre TEXT,
  cover_url TEXT,
  open_library_key TEXT,  -- For future lookups/linking

  -- User-specific per-reading info
  format TEXT CHECK (format IN ('physical', 'ebook', 'audio')),
  source TEXT CHECK (source IN ('owned', 'library', 'kindle_unlimited', 'audible', 'borrowed', 'other')),
  status TEXT NOT NULL DEFAULT 'to_read' CHECK (status IN ('to_read', 'reading', 'completed', 'dnf')),
  priority INTEGER CHECK (priority >= 1 AND priority <= 5),

  -- Dates
  added_at DATE DEFAULT CURRENT_DATE,
  started_at DATE,
  finished_at DATE,

  -- Review (specific to this reading)
  rating DECIMAL(3,1) CHECK (rating >= 0 AND rating <= 10),
  notes TEXT,
  would_reread BOOLEAN DEFAULT false,

  -- Re-read tracking
  reading_number INTEGER DEFAULT 1,  -- 1 = first read, 2 = second read, etc.

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sort_order INTEGER
);

-- Indexes
CREATE INDEX idx_books_owner ON books(owner_id);
CREATE INDEX idx_books_owner_status ON books(owner_id, status);
CREATE INDEX idx_books_owner_finished ON books(owner_id, finished_at);
CREATE INDEX idx_books_title_author ON books(owner_id, title, author);

-- RLS policies
ALTER TABLE books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own books" ON books
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own books" ON books
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own books" ON books
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own books" ON books
  FOR DELETE USING (auth.uid() = owner_id);
