CREATE TABLE IF NOT EXISTS subdivision_campaign_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subdivision_id uuid NOT NULL REFERENCES subdivisions(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'available',
  notes text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(subdivision_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_scp_subdivision ON subdivision_campaign_progress(subdivision_id);
CREATE INDEX IF NOT EXISTS idx_scp_campaign ON subdivision_campaign_progress(campaign_id);

ALTER TABLE subdivision_campaign_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read campaign progress"
  ON subdivision_campaign_progress FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can upsert campaign progress"
  ON subdivision_campaign_progress FOR ALL
  TO authenticated USING (true);
