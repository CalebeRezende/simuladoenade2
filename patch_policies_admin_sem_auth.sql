-- PATCH: liberar operações do painel admin via chave anon, sem Supabase Auth.
-- Rode no Supabase > SQL Editor.

drop policy if exists "Anon manage questions" on public.questions;
create policy "Anon manage questions"
on public.questions for all to anon
using (true) with check (true);

drop policy if exists "Anon manage exams" on public.exams;
create policy "Anon manage exams"
on public.exams for all to anon
using (true) with check (true);

drop policy if exists "Anon manage exam questions" on public.exam_questions;
create policy "Anon manage exam questions"
on public.exam_questions for all to anon
using (true) with check (true);

drop policy if exists "Anon read attempts" on public.exam_attempts;
create policy "Anon read attempts"
on public.exam_attempts for select to anon
using (true);
