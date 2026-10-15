-- Allow pricing editors to remove AI review jobs (proposals and price results cascade).

drop policy if exists "ai_jobs_delete" on public.ai_jobs;

create policy "ai_jobs_delete" on public.ai_jobs
  for delete using (
    public.current_user_role() in ('administrator', 'project_manager')
  );
