-- "Other ducks": ducks a survey counted without splitting them by species.
-- AGFC's aerial surveys report only mallards and total ducks, so the parser stores
-- total ducks minus mallards here. A remainder rather than a "total ducks" row keeps every
-- SUM(count) across species correct (flyway progression, chat, historical trends).
-- Idempotent.
INSERT INTO species (slug, name, category, description, is_migratory, flyways, metadata)
VALUES (
  'other-ducks',
  'Other ducks',
  'waterfowl',
  'Ducks counted in a survey but not identified to species (for example, AGFC aerial survey total ducks minus mallards).',
  true,
  -- double-encoded like every other species row (Drizzle stores jsonb as a JSON string)
  to_jsonb('["mississippi","central"]'::text),
  to_jsonb('{"aggregate":true,"note":"Not a species: survey ducks not split by species"}'::text)
)
ON CONFLICT (slug) DO NOTHING;
