-- Rubric analysis returned by Module D for each response
-- {criteria: {relevance, technical_accuracy, depth, structure, communication}, strengths: [], improvements: [], model_answer: ""}
alter table public.interview_responses add column if not exists analysis jsonb;
