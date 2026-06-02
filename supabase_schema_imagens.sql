-- Estrutura para simulados com imagens recortadas de questões
create extension if not exists pgcrypto;

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  number_original text,
  prova_origem text,
  disciplina text,
  enunciado text default '',
  image_url text not null,
  correct_answer text check (correct_answer in ('A','B','C','D')) default 'A',
  is_anulada boolean not null default false,
  tags text[] not null default '{}'
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  description text,
  disciplina text,
  duration_minutes integer not null default 240,
  active boolean not null default true
);

create table if not exists public.exam_questions (
  exam_id uuid references public.exams(id) on delete cascade,
  question_id uuid references public.questions(id) on delete cascade,
  position integer not null,
  primary key (exam_id, question_id)
);

create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  exam_id uuid references public.exams(id) on delete set null,
  nome text not null,
  email text,
  respostas jsonb not null default '{}'::jsonb,
  correcao jsonb not null default '[]'::jsonb,
  acertos integer not null,
  erros integer not null,
  em_branco integer not null,
  anuladas integer not null default 0,
  total_questoes integer not null,
  nota_texto text not null,
  percentual numeric(5,2) not null,
  iniciado_em timestamptz not null,
  enviado_em timestamptz not null,
  duracao_segundos integer,
  user_agent text
);

alter table public.questions enable row level security;
alter table public.exams enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_attempts enable row level security;

drop policy if exists "Public can read active exams" on public.exams;
create policy "Public can read active exams" on public.exams for select to anon, authenticated using (active = true or auth.role() = 'authenticated');

drop policy if exists "Public can read questions" on public.questions;
create policy "Public can read questions" on public.questions for select to anon, authenticated using (true);

drop policy if exists "Public can read exam questions" on public.exam_questions;
create policy "Public can read exam questions" on public.exam_questions for select to anon, authenticated using (true);

drop policy if exists "Public can insert attempts" on public.exam_attempts;
create policy "Public can insert attempts" on public.exam_attempts for insert to anon, authenticated with check (true);

drop policy if exists "Admins manage questions" on public.questions;
create policy "Admins manage questions" on public.questions for all to authenticated using (true) with check (true);

drop policy if exists "Admins manage exams" on public.exams;
create policy "Admins manage exams" on public.exams for all to authenticated using (true) with check (true);

drop policy if exists "Admins manage exam questions" on public.exam_questions;
create policy "Admins manage exam questions" on public.exam_questions for all to authenticated using (true) with check (true);

drop policy if exists "Admins read attempts" on public.exam_attempts;
create policy "Admins read attempts" on public.exam_attempts for select to authenticated using (true);

create index if not exists questions_disciplina_idx on public.questions (disciplina);
create index if not exists questions_origem_idx on public.questions (prova_origem);
create index if not exists exams_active_idx on public.exams (active);
create index if not exists exam_attempts_enviado_idx on public.exam_attempts (enviado_em desc);
