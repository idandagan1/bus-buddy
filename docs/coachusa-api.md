# Coach USA API (reverse-engineered from coachusa.com, Nov 2026)

Unofficial and undocumented. No auth headers, plain GET, JSON. CORS is locked to
coachusa.com, which only affects browsers — the native app can call it directly.

Base: `https://api.prod.coachusa.com`

Carrier codes the site sends: `COM LZR NAE OWL RCK HTL SUB VGB WCC WCL WCS MB MBC`
(repeat `carrierCode=` per code). `RCK` = Rockland Coaches (route 20).

## Stop search
`GET /journey/location?type=pickup&query=Tenafly&carrierCode=...`
→ `{ results: [{ id: "stop-…", stop: { name }, place: { name, state: { code } }, location: { latitude, longitude } }] }`
(lat/lng are strings). Omit `query` to get all pickup stops.

## Destinations reachable from a stop
`GET /journey/location?origin=<stop id>&query=Port%20Authority&carrierCode=...`

## Trips
`GET /journey?origin=<stop id>&destination=<stop id>&dateFrom=YYYY-MM-DD`
→ `{ origin, destination, results: [...] }`, ~a week of trips (~1 MB).
Each result: `route.longName` ("20"), `carrier.code`, `trip.headsign`,
`origin.departure.time` / `destination.arrival.time` (ISO with offset),
`stops[]` = full stop sequence with times and coordinates.

Example: Hillside Ave & Highwood Ave, Tenafly = `stop-sTtYwDuikL9q5VddUnwEzf`,
Port Authority Bus Terminal = `stop-sBH4aYcwNntYLsECtb9HCq`.

## Fare
`GET /origin/TNFL/destination/NYCP/fare?operatorCode=RCK&serviceUuid=<8 chars>&date=YYYY-MM-DD`

## Service advisories (alerts)
Not in the JSON API. They're embedded in the schedule page's Next.js data:
`GET https://www.coachusa.com/travel-option/<origin ref>/<dest ref>/<serviceUuid 8 chars>`
→ `<script id="__NEXT_DATA__">` → `props.pageProps.serviceAdvisories` (all carriers, ~50 items, ~900 KB page).
Each item: `heading`, `severity` (high|low|info), `scheduleSummary.json` (Contentful rich text),
`displayFromDate`/`displayUntilDate`, `displayRulesCollection.items[] = { operator[], originZone[], destZone[] }`
(`"*"` = any). Match `operator` to the trip's `carrier.code`, zones to `origin/destination.farezone`.
Live bus tracking exists on their side but is "temporarily unavailable" as of Oct 2026.

## Live trip status
`GET /journey/<result id>/status?date=YYYY-MM-DD` (the trip's service date; result ids repeat daily)
→ `{ status: SCHEDULED|IN_PROGRESS|…, vehicleName, origin/destination/stops[]: { arrivalTime, departureTime: { scheduled, actual?, estimated? } }, vehiclePosition: { latitude, longitude, bearing, speedMph, lastUpdated }, timeRetrieved }`.
Origin/destination are the searched stops. Cached upstream for 60s; coachusa.com fetches one per visible trip.
