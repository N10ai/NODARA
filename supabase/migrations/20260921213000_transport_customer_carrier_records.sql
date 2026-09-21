alter table public.transport_orders
 add column if not exists customer_address_id uuid references public.entity_addresses(id),
 add column if not exists customer_contact_id uuid references public.entity_contacts(id),
 add column if not exists customer_name text,
 add column if not exists customer_address text,
 add column if not exists customer_contact text,
 add column if not exists carrier_address_id uuid references public.entity_addresses(id),
 add column if not exists carrier_contact_id uuid references public.entity_contacts(id),
 add column if not exists carrier_name text,
 add column if not exists carrier_address text,
 add column if not exists carrier_contact text;
