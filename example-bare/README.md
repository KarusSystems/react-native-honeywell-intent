# Bare RN example (RN 0.71.19, Android 5.1+)

Bare React Native app consuming `react-native-honeywell-intent` via classic
autolinking. Pinned to RN 0.71.19 so the minimum Android SDK can stay at
21 (Android 5.1), matching older Zebra TC-series firmware.

The demo UI is identical to the Expo example — both apps re-export from
[`@hwi/example-shared`](../example-shared). The "Bare RN" badge on the
About screen confirms which build is running.

## Optional resource overrides

Copy [`honeywell_intent.example.xml`](./honeywell_intent.example.xml) into
`android/app/src/main/res/values/honeywell_intent.xml` to override the
library defaults (profile name, scan action, decoders, keystroke output).

## Run

From the repo root:

```sh
yarn install
cd example-bare
npx react-native run-android
```
