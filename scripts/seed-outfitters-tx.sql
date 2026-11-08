-- ===========================================
-- Seed: the 14 hand-curated Texas outfitters (2026-11-07)
--
-- Moves the listings that were hardcoded in apps/api/src/routes/outfitters.ts into the
-- outfitters table so the public directory, owner claims and edits all work on one store.
-- Generated from that array before it was deleted. The legacy ids (tx-01..tx-14) are kept
-- in the metadata column so old links keep resolving. Run AFTER add-outfitter-self-service.sql.
-- Applied by hand, never drizzle-kit push. Idempotent: ON CONFLICT (slug) DO NOTHING.
-- ===========================================
\set ON_ERROR_STOP on

INSERT INTO outfitters (name, slug, description, location, contact_phone, website, hunt_types, species_offered, states_served, price_range, is_verified, is_active, rating, review_count, owner_id, metadata)
VALUES ('Top Gun Outfitters', 'top-gun-outfitters', 'Premier North Texas waterfowl outfitter with access to 80,000+ acres across 8 counties. Known for specklebelly goose and playa lake duck hunts. 4,250 sq ft lodge with meals included.', '{"city":"Goree","state":"TX"}'::jsonb, '(806) 701-8065', 'https://topgunoutfitters.com', '["guided"]'::jsonb, '["Mallard","Pintail","Wigeon","Gadwall","Teal","Specklebelly","Snow Goose","Canada Goose","Sandhill Crane","Dove"]'::jsonb, '["TX"]'::jsonb, '$$$', true, true, NULL, 0, NULL, '{"legacyId":"tx-01","priceNote":"Contact for pricing"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO outfitters (name, slug, description, location, contact_phone, website, hunt_types, species_offered, states_served, price_range, is_verified, is_active, rating, review_count, owner_id, metadata)
VALUES ('Longneck Outfitters', 'longneck-outfitters', 'Over two decades of waterfowl and crane guiding in the Texas Panhandle. Specializes in sandhill crane and goose hunts December through mid-March.', '{"city":"Lubbock","state":"TX"}'::jsonb, '(806) 642-1885', 'https://longneckoutfitters.com', '["guided"]'::jsonb, '["Sandhill Crane","Snow Goose","Canada Goose","Mallard","Teal","Dove"]'::jsonb, '["TX"]'::jsonb, '$$$', true, true, NULL, 0, NULL, '{"legacyId":"tx-02","priceNote":"Contact for pricing"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO outfitters (name, slug, description, location, contact_phone, website, hunt_types, species_offered, states_served, price_range, is_verified, is_active, rating, review_count, owner_id, metadata)
VALUES ('Caprock Waterfowl Outfitters', 'caprock-waterfowl-outfitters', 'Veteran-owned operation in the Texas Panhandle. One of the few outfitters with published day-rate pricing. Long seasons with no splits.', '{"city":"Tahoka","state":"TX"}'::jsonb, '(940) 293-3737', 'https://caprockwaterfowloutfitters.com', '["guided"]'::jsonb, '["Mallard","Pintail","Teal","Canada Goose","Snow Goose","Sandhill Crane","Dove"]'::jsonb, '["TX"]'::jsonb, '$$', true, true, NULL, 0, NULL, '{"legacyId":"tx-03","priceNote":"$300/day (without lodging), $350/day (with lodging)"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO outfitters (name, slug, description, location, contact_phone, website, hunt_types, species_offered, states_served, price_range, is_verified, is_active, rating, review_count, owner_id, metadata)
VALUES ('Waterfowl Outfitters Unlimited', 'waterfowl-outfitters-unlimited', 'Located in the Goose Hunting Capital of the World. Rice field and flooded pond hunts with hundreds of thousands of geese roosting nightly. Guides, decoys, dogs, and white parkas provided.', '{"city":"Eagle Lake","state":"TX"}'::jsonb, '(832) 361-0868', 'https://waterfowloutfittersunlimited.com', '["guided"]'::jsonb, '["Snow Goose","Specklebelly","Canada Goose","Mallard","Pintail","Teal"]'::jsonb, '["TX"]'::jsonb, '$$$', true, true, NULL, 0, NULL, '{"legacyId":"tx-04","priceNote":"Contact for pricing"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO outfitters (name, slug, description, location, contact_phone, website, hunt_types, species_offered, states_served, price_range, is_verified, is_active, rating, review_count, owner_id, metadata)
VALUES ('Waterfowl Specialties Inc.', 'waterfowl-specialties', 'Family-operated outfitter established in 1984. Located in the Texas Rice Belt 40 miles from the Gulf Coast. Over 40 years of continuous operation serving individuals, families, and corporate groups.', '{"city":"El Campo","state":"TX"}'::jsonb, '(979) 543-1109', 'https://waterfowlspecialties.com', '["guided"]'::jsonb, '["Mallard","Pintail","Teal","Gadwall","Canada Goose","Dove","Sandhill Crane"]'::jsonb, '["TX"]'::jsonb, '$$$', true, true, NULL, 0, NULL, '{"legacyId":"tx-05","priceNote":"Contact for pricing"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO outfitters (name, slug, description, location, contact_phone, website, hunt_types, species_offered, states_served, price_range, is_verified, is_active, rating, review_count, owner_id, metadata)
VALUES ('Tule Creek Outfitters', 'tule-creek-outfitters', 'Panhandle outfitter with full lodge accommodations. Upland and waterfowl combination hunts across cultivated cropland, shelterbelts, and CRP land. Partners with Sitka, Orvis, and Browning.', '{"city":"Tulia","state":"TX"}'::jsonb, '(806) 441-4868', 'https://tulecreek.com', '["guided"]'::jsonb, '["Pheasant","Quail","Dove","Mallard","Canada Goose","Sandhill Crane"]'::jsonb, '["TX"]'::jsonb, '$$$', true, true, NULL, 0, NULL, '{"legacyId":"tx-06","priceNote":"$600-$2,700/person depending on package"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO outfitters (name, slug, description, location, contact_phone, website, hunt_types, species_offered, states_served, price_range, is_verified, is_active, rating, review_count, owner_id, metadata)
VALUES ('Texas Fowl Outfitters', 'texas-fowl-outfitters', 'Family-oriented outfitter with 15+ years guiding waterfowl in North Texas and Southern Oklahoma. Broad multi-species menu including deer and hog. Lodging available.', '{"city":"Dodd City","state":"TX"}'::jsonb, '(903) 449-2773', 'https://texasfowl.com', '["guided"]'::jsonb, '["Mallard","Pintail","Teal","Wigeon","Gadwall","Canvasback","Redhead","Snow Goose","Canada Goose","Whitetail Deer","Wild Hog"]'::jsonb, '["TX","OK"]'::jsonb, '$$', true, true, NULL, 0, NULL, '{"legacyId":"tx-07","priceNote":"Contact for pricing"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO outfitters (name, slug, description, location, contact_phone, website, hunt_types, species_offered, states_served, price_range, is_verified, is_active, rating, review_count, owner_id, metadata)
VALUES ('Dirty Texas Outfitters', 'dirty-texas-outfitters', 'Full-service outfitter covering nearly every huntable species in Texas. Waterfowl, upland, thermal hog hunts, and big game packages. Hosts the Fowl Talk Podcast.', '{"city":"Loraine","state":"TX"}'::jsonb, NULL, 'https://dirtytexasoutfitters.com', '["guided"]'::jsonb, '["Mallard","Teal","Canada Goose","Snow Goose","Sandhill Crane","Whitetail Deer","Axis Deer","Blackbuck Antelope","Wild Hog","Quail","Dove","Turkey"]'::jsonb, '["TX"]'::jsonb, '$$$', true, true, NULL, 0, NULL, '{"legacyId":"tx-08","priceNote":"Contact for pricing"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO outfitters (name, slug, description, location, contact_phone, website, hunt_types, species_offered, states_served, price_range, is_verified, is_active, rating, review_count, owner_id, metadata)
VALUES ('Fin & Fowl Outfitters', 'fin-and-fowl-outfitters', 'Guided duck, goose, and coastal hunting along the Texas Coastal Prairie. Also offers alligator and hog hunts.', '{"city":"Texas Coastal Prairie","state":"TX"}'::jsonb, NULL, 'https://finandfowloutfitters.com', '["guided"]'::jsonb, '["Mallard","Teal","Gadwall","Canada Goose","Snow Goose","Wild Hog"]'::jsonb, '["TX"]'::jsonb, '$$$', true, true, NULL, 0, NULL, '{"legacyId":"tx-09","priceNote":"Contact for pricing"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO outfitters (name, slug, description, location, contact_phone, website, hunt_types, species_offered, states_served, price_range, is_verified, is_active, rating, review_count, owner_id, metadata)
VALUES ('North Texas Waterfowl', 'north-texas-waterfowl', 'Boutique operation hunting private land adjacent to Hagerman NWR. One hunting party per day for an exclusive experience.', '{"city":"Hagerman NWR area","state":"TX"}'::jsonb, NULL, 'https://northtexaswaterfowl.com', '["guided"]'::jsonb, '["Mallard","Pintail","Teal","Canada Goose","Snow Goose"]'::jsonb, '["TX"]'::jsonb, '$$', true, true, NULL, 0, NULL, '{"legacyId":"tx-10","priceNote":"Contact for pricing"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO outfitters (name, slug, description, location, contact_phone, website, hunt_types, species_offered, states_served, price_range, is_verified, is_active, rating, review_count, owner_id, metadata)
VALUES ('Final Descent Guide Services', 'final-descent-guide-services', 'Lubbock-based waterfowl guide service offering duck, goose, and crane hunts across the Texas Panhandle and South Plains.', '{"city":"Lubbock","state":"TX"}'::jsonb, NULL, 'https://www.finaldescentguiding.com', '["guided"]'::jsonb, '["Mallard","Teal","Canada Goose","Snow Goose","Sandhill Crane"]'::jsonb, '["TX"]'::jsonb, '$$', true, true, NULL, 0, NULL, '{"legacyId":"tx-11","priceNote":"Contact for pricing"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO outfitters (name, slug, description, location, contact_phone, website, hunt_types, species_offered, states_served, price_range, is_verified, is_active, rating, review_count, owner_id, metadata)
VALUES ('Cadillac Creek Outfitters', 'cadillac-creek-outfitters', 'Upscale waterfowl outfitter in the Texas Panhandle with guided duck, goose, and sandhill crane hunts. Full lodge accommodations with chef-prepared meals.', '{"city":"Amarillo","state":"TX"}'::jsonb, '(806) 602-9517', 'https://cadillaccreek.com', '["guided"]'::jsonb, '["Mallard","Pintail","Teal","Canada Goose","Snow Goose","Sandhill Crane"]'::jsonb, '["TX"]'::jsonb, '$$$', true, true, NULL, 0, NULL, '{"legacyId":"tx-12","priceNote":"Contact for pricing"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO outfitters (name, slug, description, location, contact_phone, website, hunt_types, species_offered, states_served, price_range, is_verified, is_active, rating, review_count, owner_id, metadata)
VALUES ('Rockin G Ranch', 'rockin-g-ranch', 'Full-service ranch in Hall County offering high-fence and low-fence big game hunts alongside wing shooting for dove, quail, and pheasant. Also offers hog hunts and fishing.', '{"city":"Turkey","state":"TX"}'::jsonb, '(806) 342-5000', 'https://rockinggranch.com', '["guided"]'::jsonb, '["Whitetail Deer","Mule Deer","Elk","Dove","Quail","Pheasant","Wild Hog","Turkey"]'::jsonb, '["TX"]'::jsonb, '$$$', true, true, NULL, 0, NULL, '{"legacyId":"tx-13","priceNote":"$300/day hunter fee + trophy fees"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO outfitters (name, slug, description, location, contact_phone, website, hunt_types, species_offered, states_served, price_range, is_verified, is_active, rating, review_count, owner_id, metadata)
VALUES ('Ambush Waterfowl', 'ambush-waterfowl', 'Guided sandhill crane and waterfowl hunts across grain fields in the Central Flyway near Abilene. Specializes in crane hunting during peak migration.', '{"city":"Abilene","state":"TX"}'::jsonb, NULL, NULL, '["guided"]'::jsonb, '["Sandhill Crane","Mallard","Teal","Canada Goose"]'::jsonb, '["TX"]'::jsonb, '$$$', true, true, NULL, 0, NULL, '{"legacyId":"tx-14","priceNote":"Contact for pricing"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;
