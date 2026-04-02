-- Migration 013: Fix correct_answer_index for questions imported with "(OK)" marker in answer text
-- The original import left "(OK)" in the answer text with various spacing patterns
-- (trailing spaces, double spaces, etc.) and correct_answer_index defaulted to 0.

DO $$
DECLARE
  rec RECORD;
  i INT;
  ans TEXT;
  new_answers TEXT[];
  found_idx INT;
  fixed_count INT := 0;
BEGIN
  FOR rec IN
    SELECT id, answers, correct_answer_index
    FROM public.questions
    WHERE answers::text LIKE '%(OK)%'
  LOOP
    found_idx := rec.correct_answer_index;
    new_answers := '{}';

    FOR i IN 1..array_length(rec.answers, 1) LOOP
      ans := rec.answers[i];
      IF ans ~ '\(OK\)\s*$' THEN
        found_idx := i - 1;
        ans := trim(regexp_replace(ans, '\s*\(OK\)\s*$', ''));
      END IF;
      new_answers := array_append(new_answers, ans);
    END LOOP;

    UPDATE public.questions
    SET answers = new_answers, correct_answer_index = found_idx
    WHERE id = rec.id;

    fixed_count := fixed_count + 1;
  END LOOP;

  RAISE NOTICE 'Fixed % questions', fixed_count;
END $$;
