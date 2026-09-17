-- Dashboard queries. Run these in the Supabase SQL editor (it bypasses RLS, so it can read).
-- value_units is native USDC wei (18 decimals); divide by 1e18 for dollars.

-- Headline numbers.
select
  count(distinct device_id)                                                  as users,
  count(*) filter (where type = 'link_created')                              as links_created,
  count(*) filter (where type = 'link_claimed')                              as links_claimed,
  count(*) filter (where type = 'link_refunded')                             as links_refunded,
  round(sum(value_units) filter (where type = 'link_created') / 1e18, 2)     as sent_usd,
  round(sum(value_units) filter (where type = 'link_claimed') / 1e18, 2)     as claimed_usd,
  round(100.0 * count(*) filter (where type = 'link_claimed')
              / nullif(count(*) filter (where type = 'link_created'), 0), 1) as claim_rate_pct
from public.events;

-- Fee revenue: a flat 1%, taken at creation, so it mirrors what reached the treasury.
-- Cross-check against the treasury address on explorer.arc.io.
select
  count(*)                                                        as links_created,
  round(sum(value_units * 0.01) / 1e18, 2)                        as fees_usd
from public.events
where type = 'link_created';

-- People, not links.
select
  count(distinct device_id)                                                      as total_users,
  count(distinct device_id) filter (where created_at > now() - interval '7 days') as active_7d
from public.events;

-- Day by day.
select
  created_at::date                                 as day,
  count(distinct device_id)                        as users,
  count(*) filter (where type = 'link_created')    as created,
  count(*) filter (where type = 'link_claimed')    as claimed,
  count(*) filter (where type = 'link_refunded')   as refunded
from public.events
group by day
order by day desc;

-- Typical amount sent.
select
  round(avg(value_units) / 1e18, 2)                                                   as avg_usd,
  round(percentile_cont(0.5) within group (order by value_units)::numeric / 1e18, 2)  as median_usd,
  round(max(value_units) / 1e18, 2)                                                   as largest_usd
from public.events
where type = 'link_created';

-- Money still in flight: created, never claimed or refunded. Any row can be checked on-chain at
-- explorer.arc.io/address/<link_address>, or by calling links(<link_address>) on the escrow.
select e.link_address, round(e.value_units / 1e18, 2) as amount_usd, e.created_at
from public.events e
where e.type = 'link_created'
  and not exists (
    select 1 from public.events x
    where x.link_address = e.link_address and x.type in ('link_claimed', 'link_refunded')
  )
order by e.created_at desc;
