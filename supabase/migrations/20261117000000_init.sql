-- Tinder for Work Ideas — initial schema. Applied automatically by the Supabase GitHub integration,
-- or paste it into the Supabase SQL editor to run it by hand.

create table decks (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  status        text not null default 'active' check (status in ('active','archived')),
  title_field   text not null,                 -- CSV column shown as the card title
  detail_fields jsonb not null default '[]',   -- 0-2 CSV columns shown as details
  created_at    timestamptz not null default now()
);

create table items (
  id       bigint generated always as identity primary key,
  deck_id  uuid not null references decks(id),
  fields   jsonb not null,
  position int not null
);
create index items_deck_position on items (deck_id, position);

create table swipes (
  id          bigint generated always as identity primary key,
  deck_id     uuid not null references decks(id),
  item_id     bigint not null references items(id),
  user_name   text not null,
  direction   text not null check (direction in ('yes','no')),
  "timestamp" timestamptz not null default now(),
  unique (item_id, user_name)                  -- one vote per user per item
);
create index swipes_deck_user on swipes (deck_id, user_name);

create table comments (
  id          bigint generated always as identity primary key,
  deck_id     uuid not null references decks(id),
  item_id     bigint not null references items(id),
  user_name   text not null,
  message     text not null,
  "timestamp" timestamptz not null default now()
);
create index comments_deck on comments (deck_id, item_id);

-- Next unswiped items for a user, in deck order. This is the swipe queue:
-- the client pulls 50 at a time, so deck size never matters.
create function next_items(p_deck uuid, p_user text, p_limit int default 50)
returns setof items language sql stable as $$
  select i.* from items i
  where i.deck_id = p_deck
    and not exists (select 1 from swipes s where s.item_id = i.id and s.user_name = p_user)
  order by i.position
  limit p_limit;
$$;

-- Active decks with this user's progress.
create function deck_progress(p_user text)
returns table (id uuid, name text, total bigint, done bigint) language sql stable as $$
  select d.id, d.name,
    (select count(*) from items i where i.deck_id = d.id),
    (select count(*) from swipes s where s.deck_id = d.id and s.user_name = p_user)
  from decks d
  where d.status = 'active'
  order by d.created_at desc;
$$;

-- All decks with item count and how far each person has got (admin page).
create view deck_overview with (security_invoker = true) as
select d.*,
  (select count(*) from items i where i.deck_id = d.id) as item_count,
  coalesce((select jsonb_object_agg(t.user_name, t.n)
            from (select s.user_name, count(*) as n from swipes s where s.deck_id = d.id group by s.user_name) t),
           '{}'::jsonb) as progress
from decks d;

-- Per-item tally + verdict. Disputed = at least one yes and one no.
create view item_results with (security_invoker = true) as
select
  i.id as item_id, i.deck_id, i.position, i.fields,
  count(*) filter (where s.direction = 'yes') as yes_count,
  count(*) filter (where s.direction = 'no')  as no_count,
  coalesce(jsonb_object_agg(s.user_name, s.direction) filter (where s.user_name is not null), '{}'::jsonb) as votes,
  case
    when count(*) filter (where s.direction = 'yes') > 0
     and count(*) filter (where s.direction = 'no')  > 0 then 'disputed'
    when count(*) filter (where s.direction = 'yes') >= 2 then 'consensus_yes'
    when count(*) filter (where s.direction = 'no')  >= 2 then 'consensus_no'
    when count(s.id) = 1 then 'single_vote'
    else 'unswiped'
  end as verdict
from items i
left join swipes s on s.item_id = i.id
group by i.id, i.deck_id;

-- Access: no login, so the public (anon) key can read and write.
-- Nothing can be deleted except a user's own swipe (undo) — decks/items/comments are permanent.
alter table decks    enable row level security;
alter table items    enable row level security;
alter table swipes   enable row level security;
alter table comments enable row level security;

create policy decks_read    on decks    for select to anon using (true);
create policy decks_create  on decks    for insert to anon with check (true);
create policy decks_update  on decks    for update to anon using (true) with check (true);
create policy items_read    on items    for select to anon using (true);
create policy items_create  on items    for insert to anon with check (true);
create policy swipes_all    on swipes   for all    to anon using (true) with check (true);
create policy comments_read on comments for select to anon using (true);
create policy comments_add  on comments for insert to anon with check (true);

grant select, insert, update on decks to anon;
grant select, insert on items, comments to anon;
grant select, insert, update, delete on swipes to anon;
grant select on item_results, deck_overview to anon;
grant execute on function next_items(uuid, text, int), deck_progress(text) to anon;
