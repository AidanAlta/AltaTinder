-- Sign-in: only verified @altatechnologies.com accounts can use the app.
-- Replaces the open (no-login) access from the initial migration.

-- 1. Nobody outside the domain can create an account, so no sign-in email is ever sent to them.
create function public.only_alta_emails() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if lower(coalesce(new.email, '')) not like '%@altatechnologies.com' then
    raise exception 'Only @altatechnologies.com email addresses can sign in.';
  end if;
  return new;
end $$;

create trigger only_alta_emails
  before insert or update of email on auth.users
  for each row execute function public.only_alta_emails();

-- 2. Who is calling. The email comes from the verified sign-in token, not from the page.
create function public.my_email() returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create function public.is_alta() returns boolean language sql stable as $$
  select public.my_email() like '%@altatechnologies.com'
$$;

-- 3. The public (anon) key can no longer read or write anything.
drop policy decks_read    on decks;
drop policy decks_create  on decks;
drop policy decks_update  on decks;
drop policy items_read    on items;
drop policy items_create  on items;
drop policy swipes_all    on swipes;
drop policy comments_read on comments;
drop policy comments_add  on comments;

revoke all on decks, items, swipes, comments, item_results, deck_overview from anon;
revoke execute on function next_items(uuid, text, int), deck_progress(text) from anon, public;

-- 4. Signed-in Alta staff can see everything, but can only vote and comment as themselves.
create policy decks_read    on decks    for select to authenticated using ((select public.is_alta()));
create policy decks_create  on decks    for insert to authenticated with check ((select public.is_alta()));
create policy decks_update  on decks    for update to authenticated using ((select public.is_alta())) with check ((select public.is_alta()));
create policy items_read    on items    for select to authenticated using ((select public.is_alta()));
create policy items_create  on items    for insert to authenticated with check ((select public.is_alta()));

create policy swipes_read   on swipes   for select to authenticated using ((select public.is_alta()));
create policy swipes_insert on swipes   for insert to authenticated
  with check ((select public.is_alta()) and user_name = (select public.my_email()));
create policy swipes_update on swipes   for update to authenticated
  using (user_name = (select public.my_email())) with check (user_name = (select public.my_email()));
create policy swipes_delete on swipes   for delete to authenticated
  using (user_name = (select public.my_email()));

create policy comments_read on comments for select to authenticated using ((select public.is_alta()));
create policy comments_add  on comments for insert to authenticated
  with check ((select public.is_alta()) and user_name = (select public.my_email()));

grant select, insert, update on decks to authenticated;
grant select, insert on items, comments to authenticated;
grant select, insert, update, delete on swipes to authenticated;
grant select on item_results, deck_overview to authenticated;
grant execute on function next_items(uuid, text, int), deck_progress(text) to authenticated;

alter table swipes   alter column user_name set default public.my_email();
alter table comments alter column user_name set default public.my_email();
