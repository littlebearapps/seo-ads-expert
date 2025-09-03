Great direction. Here’s a tight reassessment that folds in (a) a fresh Google Ads account with no live campaigns and (b) RapidAPI for testing, without stalling your launch.

# Executive call
	•	Ship V1 with no Google Ads API writes. Use Keyword Planner CSV exports as ground-truth for volume/CPC/competition, and RapidAPI for ideation + SERP shape only.
	•	Keep your CLI Phase-1 (Claude can run it). Convert to MCP once outputs feel right.

⸻

What to change in your V1 plan (minimal edits, big impact)

## 1) Connectors: swap/rename for V1 reality

Replace
	•	connectors/google-ads.ts → connectors/kwp_csv.ts (ingest Keyword Planner CSVs; one per market).
	•	CSV precedence = authoritative for volume/CPC/comp.
	•	Keep connectors/search-console.ts (official) as-is.
	•	Keep connectors/serp.ts, but point it to RapidAPI “Real-Time Web Search” for now (low call count, cached).
	•	Add connectors/rapid_keywords.ts that can hit:
	•	RapidAPI Google Keyword Insight and/or Smart Keyword Research for ideas only (tag metrics as estimated).
	•	(Later) re-introduce google-ads.ts when your dev token is approved; keep the same output contract so nothing else changes.

Precedence rule inside the orchestrator

metrics.volume, metrics.cpc, metrics.competition:
  use KWP CSV if present
  else use GSC click/impress proxy   (very rough)
  else use RapidAPI estimated        (mark source="estimated")
  
## 2) Markets & locale mapping (fix)

Add a tiny map so SERP calls reflect region language:
	•	AU → gl=au, hl=en-AU
	•	US → gl=us, hl=en
	•	GB → gl=gb, hl=en-GB
This prevents false positives from mixed-locale SERPs.

## 3) Scoring tweaks (so RapidAPI doesn’t skew)

Your formula is good; add:
	•	source_penalty: −0.1 if metrics are estimated (RapidAPI), 0 if KWP.
	•	Chrome-extension intent boost: +0.3 if query contains chrome extension|addon|install.
	•	Blockers weight: cap serp_blockers at 0.6 when only one feature (e.g., PAA) shows; apply full 1.0 when AI Overview + video/shopping coexist.

## 4) Clustering output → ad groups & pages (enforce alignment)
	•	Each cluster must map to exactly one landing page. If it doesn’t exist, auto-emit a brief in seo_pages.md.
	•	In ads.json, pin one headline containing “Chrome Extension”. Add sitelinks: Docs, Privacy, Formats/Features, Changelog.

## 5) Negatives (seed now, not later)

Ship negatives.txt pre-filled:
	•	ConvertMyFile: android, iphone, ios, safari, opera, online, api, ffmpeg, tutorial, jobs, course
	•	PaletteKit: paint, nails, makeup, wallpaper, printer, clothing, android, ios
	•	NoteBridge: journal prompts, diary, notebook (paper), internship, jobs, pdf editor (if unsupported)

## 6) Dependencies & structure (trim)
	•	Install: axios zod commander pino csv-parse csv-stringify date-fns
-D typescript tsx @types/node vitest
	•	Drop: @google-cloud/storage, chalk, nodemon (optional).
	•	Keep your folder tree; just add /inputs/kwp_csv/ for the Planner exports.

## 7) Caching & quotas (practical caps)
	•	SERP calls: ≤30 per run (e.g., 5 clusters × 2 terms × 3 markets).
	•	24h TTL cache keyed by {q, market, device}; write raw JSON under /plans/.../raw/.
	•	Make summary.json include call counts and cache hit ratio.

⸻

# Orchestrator flow (V1, pseudo)

load product.yaml
kwp = readAllCSV('/inputs/kwp_csv/<product>/*')   // by market
gsc = getSearchAnalytics(site, last_90d, by=[query,page,device,country])
ideas = rapid_keywords.expand(seed_queries)       // ideas only (estimated)
serp = sample_serps(top_clusters, markets)        // limited, cached

keywords = merge_dedupe(seed + ideas + gsc.queries + kwp.terms)
metrics = attach_metrics(keywords, kwp>gsc>rapid) // precedence
flags   = attach_serp_features(keywords, serp)
score   = compute_score(metrics, intent, longtail, blockers, source_penalty)
clusters = cluster_by_use_case(keywords)

ads.json     = groups from clusters + keywords (exact/phrase) + pinned headline
seo_pages.md = map existing pages + emit 2–4 new briefs per product (H1/title/meta/outline/FAQs)
competitors.md = top domains per cluster from SERP samples + angles
negatives.txt  = pre-seeded + any obvious from SERP terms
keywords.csv   = export all with scores & sources
summary.json   = markets, counts, cache stats, top_opportunities

## RapidAPI usage: where it fits
	•	Real-Time Web Search → competitors & blockers (primary), not volumes.
	•	Google Keyword Insight / Smart Keyword Research → seed expansion only; mark metrics as estimated.
	•	Keep call volume modest; cache aggressively. If a provider flaps, your plan still writes with flags.

⸻

## Acceptance checks (so you know it’s “good enough”)
	•	Every ad group maps to a landing page (existing or briefed).
	•	Headlines contain one pinned “Chrome Extension” + one benefit line.
	•	Keywords.csv shows source per metric (kwp|gsc|estimated).
	•	SERP blockers populated for sampled terms; competitors listed per cluster.
	•	summary.json reports cache hit ratio and ≤30 SERP calls.

⸻

## What to do right now
	1.	Create the Ads account (Expert Mode, no campaign) and export Keyword Planner CSVs for AU/US/GB per product; drop into /inputs/kwp_csv/<product>/.
	2.	Link GSC ↔ Ads so your Paid & Organic view is ready once live.
	3.	Wire the RapidAPI connectors (ideas + SERP) with 24h cache.
	4.	Implement the precedence + scoring tweaks above.
	5.	Run ConvertMyFile first; skim summary.json and eyeball 10–20 head terms against the Planner CSV for sanity.
	6.	If outputs look sane, let Claude generate RSAs + 3–4 landing page briefs from ads.json + seo_pages.md.

⸻

## One small guardrail

Only let the writers claim “local / no uploads” if that’s true for the specific conversion. Your brand_rules.banned_words is good—add a claims section per format if behavior differs.

⸻
