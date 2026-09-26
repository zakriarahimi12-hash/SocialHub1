-- SocialHub database schema for Supabase
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text,
  bio text,
  avatar_url text,
  cover_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text default '',
  image_url text,
  privacy text not null default 'public' check (privacy in ('public','friends','me')),
  created_at timestamptz not null default now()
);

alter table public.posts add column if not exists video_url text;

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'like',
  created_at timestamptz not null default now(),
  unique(post_id,user_id)
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique(requester_id,addressee_id),
  check(requester_id <> addressee_id)
);

create table if not exists public.saved_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id,post_id)
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  caption text,
  image_url text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text,
  message text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  price numeric(12,2) not null default 0,
  currency text not null default 'EUR',
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  privacy text not null default 'public',
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key(group_id,user_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.event_attendees (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'interested',
  created_at timestamptz not null default now(),
  primary key(event_id,user_id)
);

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.page_followers (
  page_id uuid not null references public.pages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(page_id,user_id)
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.profiles(id,username,full_name)
  values(
    new.id,
    coalesce(
      nullif(lower(new.raw_user_meta_data->>'username'),''),
      'user_' || substr(replace(new.id::text,'-',''),1,10)
    ),
    coalesce(new.raw_user_meta_data->>'full_name','')
  )
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.create_direct_conversation(other_user uuid)
returns uuid language plpgsql security definer set search_path=public
as $$
declare
  cid uuid;
begin
  if auth.uid() is null or other_user is null or other_user = auth.uid() then
    raise exception 'Invalid conversation participants';
  end if;

  select c.id into cid
  from public.conversations c
  join public.conversation_members a on a.conversation_id=c.id and a.user_id=auth.uid()
  join public.conversation_members b on b.conversation_id=c.id and b.user_id=other_user
  where (select count(*) from public.conversation_members m where m.conversation_id=c.id)=2
  limit 1;

  if cid is null then
    insert into public.conversations default values returning id into cid;
    insert into public.conversation_members(conversation_id,user_id) values(cid,auth.uid()),(cid,other_user);
  end if;
  return cid;
end;
$$;

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.friendships enable row level security;
alter table public.saved_posts enable row level security;
alter table public.stories enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.pages enable row level security;
alter table public.page_followers enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (id=auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated using(
  user_id=auth.uid() or privacy='public' or
  (privacy='friends' and exists(select 1 from public.friendships f where f.status='accepted' and ((f.requester_id=auth.uid() and f.addressee_id=posts.user_id) or (f.addressee_id=auth.uid() and f.requester_id=posts.user_id))))
);
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated with check(user_id=auth.uid());
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated using(user_id=auth.uid());

drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select to authenticated using(true);
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated with check(user_id=auth.uid());
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated using(user_id=auth.uid());

drop policy if exists reactions_read on public.reactions;
create policy reactions_read on public.reactions for select to authenticated using(true);
drop policy if exists reactions_write on public.reactions;
create policy reactions_write on public.reactions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists friendships_read on public.friendships;
create policy friendships_read on public.friendships for select to authenticated using(requester_id=auth.uid() or addressee_id=auth.uid());
drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships for insert to authenticated with check(requester_id=auth.uid());
drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships for update to authenticated using(addressee_id=auth.uid() or requester_id=auth.uid()) with check(addressee_id=auth.uid() or requester_id=auth.uid());
drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships for delete to authenticated using(requester_id=auth.uid() or addressee_id=auth.uid());

drop policy if exists saved_read on public.saved_posts;
create policy saved_read on public.saved_posts for select to authenticated using(user_id=auth.uid());
drop policy if exists saved_write on public.saved_posts;
create policy saved_write on public.saved_posts for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists stories_read on public.stories;
create policy stories_read on public.stories for select to authenticated using(true);
drop policy if exists stories_write on public.stories;
create policy stories_write on public.stories for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists conversations_read on public.conversations;
create policy conversations_read on public.conversations for select to authenticated using(exists(select 1 from public.conversation_members m where m.conversation_id=id and m.user_id=auth.uid()));
drop policy if exists members_read on public.conversation_members;
create policy members_read on public.conversation_members for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.conversation_members m where m.conversation_id=conversation_id and m.user_id=auth.uid()));
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated using(exists(select 1 from public.conversation_members m where m.conversation_id=messages.conversation_id and m.user_id=auth.uid()));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated with check(sender_id=auth.uid() and exists(select 1 from public.conversation_members m where m.conversation_id=messages.conversation_id and m.user_id=auth.uid()));

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated using(user_id=auth.uid());

drop policy if not exists marketplace_read on public.marketplace_listings;
create policy marketplace_read on public.marketplace_listings for select to authenticated using(true);
drop policy if exists marketplace_write on public.marketplace_listings;
create policy marketplace_write on public.marketplace_listings for all to authenticated using(seller_id=auth.uid()) with check(seller_id=auth.uid());

drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups for select to authenticated using(true);
drop policy if exists groups_write on public.groups;
create policy groups_write on public.groups for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
drop policy if exists group_members_read on public.group_members;
create policy group_members_read on public.group_members for select to authenticated using(true);
drop policy if exists group_members_write on public.group_members;
create policy group_members_write on public.group_members for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated using(true);
drop policy if exists events_write on public.events;
create policy events_write on public.events for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
drop policy if exists attendees_read on public.event_attendees;
create policy attendees_read on public.event_attendees for select to authenticated using(true);
drop policy if exists attendees_write on public.event_attendees;
create policy attendees_write on public.event_attendees for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists pages_read on public.pages;
create policy pages_read on public.pages for select to authenticated using(true);
drop policy if exists pages_write on public.pages;
create policy pages_write on public.pages for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
drop policy if exists followers_read on public.page_followers;
create policy followers_read on public.page_followers for select to authenticated using(true);
drop policy if exists followers_write on public.page_followers;
create policy followers_write on public.page_followers for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

insert into storage.buckets(id,name,public) values
('avatars','avatars',true),('covers','covers',true),('posts','posts',true),('stories','stories',true)
on conflict(id) do update set public=true;

drop policy if exists "public read socialhub media" on storage.objects;
create policy "public read socialhub media" on storage.objects for select using(bucket_id in ('avatars','covers','posts','stories'));
drop policy if exists "authenticated upload socialhub media" on storage.objects;
create policy "authenticated upload socialhub media" on storage.objects for insert to authenticated with check(bucket_id in ('avatars','covers','posts','stories'));
drop policy if exists "authenticated update socialhub media" on storage.objects;
create policy "authenticated update socialhub media" on storage.objects for update to authenticated using(bucket_id in ('avatars','covers','posts','stories'));
drop policy if exists "authenticated delete socialhub media" on storage.objects;
create policy "authenticated delete socialhub media" on storage.objects for delete to authenticated using(bucket_id in ('avatars','covers','posts','stories'));

grant usage on schema public to anon,authenticated;
grant select on public.profiles,public.posts,public.comments,public.reactions,public.friendships,public.saved_posts,public.stories,public.conversations,public.conversation_members,public.messages,public.notifications,public.marketplace_listings,public.groups,public.group_members,public.events,public.event_attendees,public.pages,public.page_followers to authenticated;
grant insert,update,delete on public.profiles,public.posts,public.comments,public.reactions,public.friendships,public.saved_posts,public.stories,public.messages,public.marketplace_listings,public.groups,public.group_members,public.events,public.event_attendees,public.pages,public.page_followers to authenticated;
grant execute on function public.create_direct_conversation(uuid) to authenticated;
