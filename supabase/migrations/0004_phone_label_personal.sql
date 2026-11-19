-- Pockit — 0004: allow the "personal" phone label (P8).
-- Only widens the allowed values; existing rows are unaffected. Idempotent.

begin;

alter table public.contact_phones drop constraint if exists contact_phones_label_check;
alter table public.contact_phones
  add constraint contact_phones_label_check
  check (label in ('mobile', 'personal', 'work', 'office', 'whatsapp', 'other'));

commit;
