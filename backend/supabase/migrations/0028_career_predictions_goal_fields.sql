-- Break the goal-directed path's target/confidence/readiness/timeframe out of
-- the `result` jsonb blob into their own columns, mirroring the existing
-- top_target_role/top_confidence/top_readiness columns. Without this, prediction
-- history can only track the model's free best-skill-match guess (which can land
-- on an unrelated role), never progress toward the user's actual stated goal.
alter table public.career_predictions
  add column if not exists goal_target_role text,
  add column if not exists goal_confidence  numeric,
  add column if not exists goal_readiness   numeric,
  add column if not exists goal_total_months int;
