# Bus Buddy

A friendlier way to ride Coach USA commuter buses in NJ/NY: saved routes, next departures with live status, service alerts, and (on iPhone) a wake-up alarm that rings before your stop.

Not affiliated with Coach USA. Data comes from coachusa.com's public web API; see [docs/coachusa-api.md](docs/coachusa-api.md).

- Web: https://bus-buddy.expo.app
- Stack: Expo SDK 58 (Expo Router, web + iOS), server API routes on EAS Hosting
- iPhone alarm: iOS 26 AlarmKit via a local Expo module in `modules/bus-alarm`

## Develop

```sh
npm install
npx expo start --web          # web + API routes on http://localhost:8081
npx expo run:ios --device     # iPhone build (needs Xcode and a signing team)
```

## Deploy the website

```sh
npx expo export -p web && npx eas-cli@latest deploy --prod
```

## Ship an iPhone update

JS-only changes go over the air to installed builds (they apply after the app is closed and reopened):

```sh
npx eas-cli@latest update --channel production --environment production --message "<what changed>"
```

The runtime version is a fingerprint of the native code, so after adding a native module or changing native config, make a new build with `npx expo run:ios --device --configuration Release`.
