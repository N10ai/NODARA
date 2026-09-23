alter table public.document_links drop constraint if exists document_links_check;
alter table public.document_links add constraint document_links_check check (
 transaction_id is not null or cargo_object_id is not null or entity_id is not null or (context_type is not null and context_id is not null)
);