-- User profile: gender and birth_year for age/gender-aware optimal lab ranges
create table if not exists user_profile (
  owner_id   uuid primary key references auth.users(id) on delete cascade,
  gender     text check (gender in ('male', 'female', 'other')),
  birth_year integer check (birth_year >= 1900 and birth_year <= 2100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_profile enable row level security;

create policy "Users can read own profile"
  on user_profile for select
  using (auth.uid() = owner_id);

create policy "Users can insert own profile"
  on user_profile for insert
  with check (auth.uid() = owner_id);

create policy "Users can update own profile"
  on user_profile for update
  using (auth.uid() = owner_id);
