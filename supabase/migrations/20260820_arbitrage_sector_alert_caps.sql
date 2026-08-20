-- Arbitrage fields, multi-contagion, sector, daily alert cap, default threshold 70

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS mecanisme TEXT,
  ADD COLUMN IF NOT EXISTS lecture_position TEXT,
  ADD COLUMN IF NOT EXISTS reserve TEXT,
  ADD COLUMN IF NOT EXISTS contagion_symbols TEXT[];

ALTER TABLE portfolio
  ADD COLUMN IF NOT EXISTS sector TEXT,
  ADD COLUMN IF NOT EXISTS max_alerts_per_day INTEGER NOT NULL DEFAULT 3;

UPDATE portfolio SET sector = 'Banque / Zone euro' WHERE symbol = 'SAN';
UPDATE portfolio SET sector = 'Banque / Zone euro' WHERE symbol = 'BNP';
UPDATE portfolio SET sector = 'ETF indiciel / Actions US' WHERE symbol = 'AUM5';
UPDATE portfolio SET sector = 'Automobile / Europe' WHERE symbol = 'STLA';
UPDATE portfolio SET sector = 'Semi-conducteurs / US' WHERE symbol = 'NVDA';

UPDATE portfolio SET max_alerts_per_day = 3 WHERE max_alerts_per_day IS NULL OR max_alerts_per_day < 1;
UPDATE portfolio SET alert_threshold = 70;
ALTER TABLE portfolio ALTER COLUMN alert_threshold SET DEFAULT 70;

UPDATE events
SET contagion_symbols = ARRAY[contagion_symbol]
WHERE contagion_symbol IS NOT NULL
  AND contagion_symbol <> '—'
  AND (contagion_symbols IS NULL OR contagion_symbols = '{}');
