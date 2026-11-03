-- Convert the accounts identified in the authorized rollout to the limited
-- commercial role. Missing accounts are intentionally a no-op, so this is
-- safe across environments with different seed data.
UPDATE "User"
SET "role" = 'ASESOR'
WHERE lower("email") IN (
  'dayanascarlet06@gmail.com',
  'leidysuper752@gmail.com',
  'mariavictoria@gmail.com',
  'geydy@importadora.com',
  'kimberlin@importadora.com',
  'candy@importadora.com'
);
