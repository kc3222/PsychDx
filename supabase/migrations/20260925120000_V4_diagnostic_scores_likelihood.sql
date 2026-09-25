-- -------------------------------------------------------------
-- diagnostic_scores: replace confidence_pct with a likelihood tier.
--    Both analysis engines now rank candidates as High / Moderate /
--    Low (the PsychDx-RAG service never returns a number, and the
--    rule-based engine was aligned to it), so the percentage column
--    is dropped. Existing rows are backfilled with the same cut-offs
--    the /home page badge used: > 60 High, > 40 Moderate, else Low.
--    Existing RLS policies on the table are unchanged.
-- -------------------------------------------------------------
alter table public.diagnostic_scores
  add column likelihood text
    check (likelihood in ('High', 'Moderate', 'Low'));

update public.diagnostic_scores
   set likelihood = case
         when confidence_pct > 60 then 'High'
         when confidence_pct > 40 then 'Moderate'
         else 'Low'
       end;

alter table public.diagnostic_scores
  alter column likelihood set not null;

alter table public.diagnostic_scores
  drop column confidence_pct;

comment on table  public.diagnostic_scores            is 'Ranked diagnosis candidates per session.';
comment on column public.diagnostic_scores.likelihood is 'Likelihood tier: High / Moderate / Low. A tier, not a probability; never render it as a percentage.';
