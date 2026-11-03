-- Add the limited commercial staff role. Existing accounts remain unchanged;
-- the selected administrator accounts are converted in the authorized rollout.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ASESOR';
