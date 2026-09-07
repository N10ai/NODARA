revoke all on function public.assign_cargo_atomic(text,uuid,uuid[]) from public,anon;
grant execute on function public.assign_cargo_atomic(text,uuid,uuid[]) to authenticated;
revoke all on function public.create_transaction_cargo_tree_atomic(text,uuid,jsonb) from public,anon;
grant execute on function public.create_transaction_cargo_tree_atomic(text,uuid,jsonb) to authenticated;
revoke all on function public.remove_cargo_assignment_atomic(uuid) from public,anon;
grant execute on function public.remove_cargo_assignment_atomic(uuid) to authenticated;
revoke all on function public.delete_transaction_cargo_subtree_atomic(uuid) from public,anon;
grant execute on function public.delete_transaction_cargo_subtree_atomic(uuid) to authenticated;
