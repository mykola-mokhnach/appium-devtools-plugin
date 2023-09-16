#!/bin/bash

adb shell 'echo "chrome --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'
adb shell am set-debug-app --persistent com.android.chrome

ARGS=(./test/functional/*.e2e.spec.js --exit --timeout 10m)
npx mocha "${ARGS[@]}"
