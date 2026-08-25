-- Run in your cloud SQL Editor. Adds a place to remember which discount
-- type a passenger selected during route-search, carried through to their
-- waiting record — NOT exposed to drivers (waiting-start deliberately
-- leaves this out of the broadcast payload).

alter table passenger_waiting_state
  add column if not exists discount_type text not null default 'regular'
  check (discount_type in ('regular', 'student', 'pwd', 'senior_citizen', 'pregnant_woman'));
