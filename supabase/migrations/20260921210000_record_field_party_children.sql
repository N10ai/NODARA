alter table public.warehouse_receipt_parties
 add column if not exists address_id uuid references public.entity_addresses(id),
 add column if not exists contact_id uuid references public.entity_contacts(id),
 add column if not exists address_text text,
 add column if not exists contact_text text;
alter table public.cargo_releases
 add column if not exists customer_address_id uuid references public.entity_addresses(id),
 add column if not exists customer_contact_id uuid references public.entity_contacts(id),
 add column if not exists consignee_address_id uuid references public.entity_addresses(id),
 add column if not exists consignee_contact_id uuid references public.entity_contacts(id),
 add column if not exists consignee_name text,
 add column if not exists consignee_address text,
 add column if not exists consignee_contact text;