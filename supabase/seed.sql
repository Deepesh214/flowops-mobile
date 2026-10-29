-- Demo data. First create a user in Authentication → Users, paste that
-- user's id into `uid` below, then run this in the Supabase SQL editor.
do $$
declare
  uid uuid := '00000000-0000-0000-0000-000000000000';
  hvac uuid;
  reader uuid;
  audit uuid;
begin
  insert into public.profiles (id, full_name, role)
  values (uid, 'Alex Morgan', 'Field Technician')
  on conflict (id) do nothing;

  insert into public.tasks (title, description, priority, status, due_at, assignee_id, requires_evidence)
  values ('HVAC inspection – Building C rooftop',
          'Quarterly preventive inspection of rooftop units RTU-1 to RTU-3.',
          'high', 'in_progress', now() + interval '2 hours', uid, true)
  returning id into hvac;

  insert into public.tasks (title, description, priority, status, due_at, assignee_id)
  values ('Replace lobby access-card reader',
          'Swap the faulty reader and re-pair it with the controller.',
          'high', 'assigned', now() - interval '3 hours', uid)
  returning id into reader;

  insert into public.tasks (title, description, priority, status, due_at, assignee_id)
  values ('Client site audit – Northside warehouse',
          'Walk-through audit of signage, exits and dock equipment.',
          'medium', 'assigned', now() + interval '3 days', uid)
  returning id into audit;

  insert into public.task_checklist_items (task_id, label, is_required, sort_order) values
    (hvac, 'Lock out / tag out units', true, 0),
    (hvac, 'Check refrigerant pressures', true, 1),
    (hvac, 'Inspect condenser coils', false, 2),
    (reader, 'Install and pair the new reader', true, 0),
    (reader, 'Test with three badges', true, 1),
    (audit, 'Emergency exits unobstructed', true, 0);
end $$;
