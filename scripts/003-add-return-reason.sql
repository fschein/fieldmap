-- Add return_reason column to assignments table
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS return_reason TEXT;

-- Add completed column to blocks table  
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;
