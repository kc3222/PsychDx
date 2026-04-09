-- -------------------------------------------------------------
-- 1. patients
--    One row per patient record owned by a clinician (identifying PHI:
--    legal names). RLS scopes rows by clinician_id; it does not anonymize.
--    Linked to profiles (clinician) via clinician_id.
-- -------------------------------------------------------------
create table public.patients (
  id              uuid        primary key default gen_random_uuid(),
  clinician_id    uuid        not null references public.profiles(id) on delete cascade,
  first_name      text        not null,
  middle_name     text,
  last_name       text        not null,
  age_range       text,
  gender          text,
  patient_ref_id  text,
  initial_notes   text,
  status          text        not null default 'active'
                              check (status in ('active', 'archived')),
  created_at      timestamptz not null default now()
);

comment on table  public.patients                is 'Patient records (PHI) belonging to a clinician; access is enforced by RLS, not by de-identification.';
comment on column public.patients.first_name     is 'Patient given name (PHI).';
comment on column public.patients.middle_name    is 'Patient middle name — optional (PHI).';
comment on column public.patients.last_name      is 'Patient family name (PHI).';
comment on column public.patients.patient_ref_id is 'Optional internal hospital/clinic reference code.';
comment on column public.patients.status         is 'active = currently under care; archived = closed case.';


-- -------------------------------------------------------------
-- 2. sessions
--    One row per clinical encounter / analysis run for a patient.
-- -------------------------------------------------------------
create table public.sessions (
  id            uuid        primary key default gen_random_uuid(),
  patient_id    uuid        not null references public.patients(id) on delete cascade,
  version       int         not null default 1,
  session_type  text        not null default 'initial_assessment'
                            check (session_type in ('initial_assessment', 'follow_up_evaluation')),
  ai_summary    text,
  session_date  date        not null default current_date,
  status        text        not null default 'active'
                            check (status in ('active', 'archived')),
  created_at    timestamptz not null default now()
);

comment on table  public.sessions            is 'One row per clinical session / AI analysis run.';
comment on column public.sessions.version    is 'Auto-incremented per patient: 1 = initial, 2+ = follow-up.';
comment on column public.sessions.ai_summary is 'AI-generated plain-text summary shown to the clinician.';
comment on column public.sessions.status     is 'active = visible in default view; archived = hidden.';


-- -------------------------------------------------------------
-- 3. diagnostic_scores
--    One row per diagnosis candidate per session.
--    e.g. session v2 → SCZ 54%, MDD 32%, Bipolar 14%
-- -------------------------------------------------------------
create table public.diagnostic_scores (
  id              uuid         primary key default gen_random_uuid(),
  session_id      uuid         not null references public.sessions(id) on delete cascade,
  diagnosis       text         not null,
  confidence_pct  numeric(5,2) not null
                               check (confidence_pct >= 0 and confidence_pct <= 100),
  rank            int          not null
);

comment on table  public.diagnostic_scores                is 'AI-generated diagnosis probabilities per session.';
comment on column public.diagnostic_scores.confidence_pct is 'Confidence percentage, e.g. 54.00 for SCZ 54%.';
comment on column public.diagnostic_scores.rank           is '1 = primary/top diagnosis; higher = lower confidence.';


-- -------------------------------------------------------------
-- 4. session_symptoms
--    One row per symptom per session.
--    Normalized so we can aggregate frequency across sessions.
-- -------------------------------------------------------------
create table public.session_symptoms (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  symptom     text not null
);

comment on table  public.session_symptoms         is 'Symptoms extracted or entered for each session.';
comment on column public.session_symptoms.symptom is 'Lowercase symptom label, e.g. insomnia, racing thoughts.';


-- =============================================================
-- INDEXES
-- =============================================================

create index idx_patients_clinician_id
  on public.patients(clinician_id);

create index idx_sessions_patient_id
  on public.sessions(patient_id);

create index idx_diagnostic_scores_session_id
  on public.diagnostic_scores(session_id);

create index idx_session_symptoms_session_id
  on public.session_symptoms(session_id);


-- =============================================================
-- GRANT REVOCATIONS
-- Unauthenticated (anon) requests must never touch clinical data.
-- =============================================================

revoke all on public.patients          from anon;
revoke all on public.sessions          from anon;
revoke all on public.diagnostic_scores from anon;
revoke all on public.session_symptoms  from anon;

-- profiles is managed by Supabase auth — revoke anon access too
revoke all on public.profiles from anon;

-- Service role: still bypasses RLS entirely by design. Protect the service key;
-- revokes above apply to anon/authenticated table privileges only.


-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

alter table public.patients          enable row level security;
alter table public.sessions          enable row level security;
alter table public.diagnostic_scores enable row level security;
alter table public.session_symptoms  enable row level security;


-- -------------------------------------------------------------
-- profiles: lock role column against self-escalation
-- Drop V1 policies first — without this, the old unrestricted
-- "Users can update own profile" policy remains active and
-- combined with OR logic would still allow role self-escalation,
-- making the new stricter policy below ineffective.
-- To change a role, run a direct update via the Supabase dashboard
-- SQL editor as the service role owner.
-- -------------------------------------------------------------
drop policy if exists "Users can view own profile"   on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "profiles: read own"
  on public.profiles
  for select
  using (id = auth.uid());

create policy "profiles: update own (no role change)"
  on public.profiles
  for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
  );

-- Belt-and-suspenders: block role changes from authenticated API sessions even if
-- policies are edited later. Allows service_role JWT and direct SQL (no JWT, e.g.
-- dashboard) so admins can still assign roles.
create or replace function public.enforce_profile_role_immutable_for_clients()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if auth.role() = 'service_role' then
      return new;
    end if;
    if auth.role() is null then
      return new;
    end if;
    raise exception 'Profile role cannot be changed from this session';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_role_immutable on public.profiles;
create trigger profiles_enforce_role_immutable
  before update on public.profiles
  for each row
  execute procedure public.enforce_profile_role_immutable_for_clients();


-- -------------------------------------------------------------
-- patients: clinician owns directly via clinician_id
-- -------------------------------------------------------------
create policy "patients: clinician full access"
  on public.patients
  for all
  using      (clinician_id = auth.uid())
  with check (clinician_id = auth.uid());


-- -------------------------------------------------------------
-- sessions: ownership flows through patients
-- -------------------------------------------------------------
create policy "sessions: clinician full access"
  on public.sessions
  for all
  using (
    patient_id in (
      select id from public.patients
      where clinician_id = auth.uid()
    )
  )
  with check (
    patient_id in (
      select id from public.patients
      where clinician_id = auth.uid()
    )
  );


-- -------------------------------------------------------------
-- diagnostic_scores: ownership flows through sessions → patients
-- -------------------------------------------------------------
create policy "diagnostic_scores: clinician full access"
  on public.diagnostic_scores
  for all
  using (
    session_id in (
      select s.id
      from public.sessions s
      join public.patients p on s.patient_id = p.id
      where p.clinician_id = auth.uid()
    )
  )
  with check (
    session_id in (
      select s.id
      from public.sessions s
      join public.patients p on s.patient_id = p.id
      where p.clinician_id = auth.uid()
    )
  );


-- -------------------------------------------------------------
-- session_symptoms: ownership flows through sessions → patients
-- -------------------------------------------------------------
create policy "session_symptoms: clinician full access"
  on public.session_symptoms
  for all
  using (
    session_id in (
      select s.id
      from public.sessions s
      join public.patients p on s.patient_id = p.id
      where p.clinician_id = auth.uid()
    )
  )
  with check (
    session_id in (
      select s.id
      from public.sessions s
      join public.patients p on s.patient_id = p.id
      where p.clinician_id = auth.uid()
    )
  );


-- =============================================================
-- FUTURE RPC REMINDER
-- Any Postgres function touching clinical data must use:
--   security invoker
-- so RLS policies above are enforced at the function level too.
-- Default (security definer) bypasses RLS entirely.
-- Example:
--   create function my_func(...)
--   language sql
--   security invoker
--   as $$ ... $$;
-- =============================================================