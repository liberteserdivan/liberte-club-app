#!/usr/bin/env bash
# android-emulator-runner sh ile cagirir; pipefail icin bash sart
set -euo pipefail
set -x
npm install --no-save appium@2.11.5 appium-uiautomator2-driver@3.9.0
npx appium driver install --source=npm appium-uiautomator2-driver
npx appium --address 127.0.0.1 --port 4723 --log appium.log --log-level info &
APPIUM_PID=$!
trap 'kill "$APPIUM_PID" 2>/dev/null || true' EXIT
for i in $(seq 1 90); do
  if curl -sf http://127.0.0.1:4723/status >/dev/null; then break; fi
  sleep 2
done
curl -sf http://127.0.0.1:4723/status
adb wait-for-device shell 'while [[ -z $(getprop sys.boot_completed) ]]; do sleep 1; done'
mkdir -p ci-logs
node scripts/verify-local-mobile-test-env.mjs
node scripts/run-local-android-smoke.mjs || {
  echo '--- appium.log tail ---'
  tail -n 120 appium.log || true
  cp appium.log ci-logs/ 2>/dev/null || true
  cp e2e/mobile/reports/*.log ci-logs/ 2>/dev/null || true
  exit 1
}
