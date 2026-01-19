-- Add return_reason column to assignments
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS return_reason TEXT;

-- Add completed column to blocks for tracking completion status
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT false;

-- Update completed status based on existing status
UPDATE blocks SET completed = true WHERE status = 'completed';
