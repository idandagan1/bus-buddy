#!/usr/bin/env bash
# Deploys the exported website to EAS Hosting and makes sure https://bus-buddy.expo.app serves it. EAS sometimes
# reports a deploy as done while production keeps serving the previous build, or fails with a temporary
# "deployment state" error; this retries the deploy once and re-points production until it matches.
set -euo pipefail

PROD=https://bus-buddy.expo.app

# The page's script bundles name the build (their file names are content hashes).
bundles() { curl -fsSL "$1/?nocache=$(date +%s%N)" | grep -o 'index-[a-f0-9]*\.js' | sort -u | tr '\n' ' '; }

deploy() { npx eas-cli@latest deploy --prod --environment production --non-interactive 2>&1 | tee /dev/stderr; }

out=$(deploy) || { echo "Deploy failed; retrying once."; sleep 20; out=$(deploy); }
id=$(grep -o 'bus-buddy--[a-z0-9]*\.expo\.app' <<<"$out" | head -1 | sed 's/^bus-buddy--//; s/\.expo\.app$//')
[ -n "$id" ] || { echo "Couldn't find the new deployment's id."; exit 1; }
want=$(bundles "https://bus-buddy--$id.expo.app")
echo "New build $id: $want"

for attempt in 1 2 3 4 5 6; do
  sleep 20
  have=$(bundles "$PROD" || true)
  if [ "$have" = "$want" ]; then echo "Production serves $id."; exit 0; fi
  echo "Production still serves: $have (check $attempt); pointing it at $id."
  npx eas-cli@latest deploy:alias --prod --id "$id" --non-interactive
done

echo "Production never switched to $id."
exit 1
