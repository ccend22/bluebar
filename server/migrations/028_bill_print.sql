-- The pre-bill (para-faturë) of an open table can go to the receipt printer too.
ALTER TABLE bluebar.print_jobs DROP CONSTRAINT print_jobs_kind_check;
ALTER TABLE bluebar.print_jobs ADD CONSTRAINT print_jobs_kind_check
  CHECK (kind IN ('ticket', 'cancel', 'invoice', 'test', 'shift', 'moved', 'bill'));
