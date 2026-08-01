#!/bin/bash

adb shell 'echo "chrome --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'
adb shell am set-debug-app --persistent com.android.chrome

npm run build
node --enable-source-maps --test --test-force-exit --test-concurrency=1 --test-timeout=600000 "./build/test/e2e/**/*.e2e.spec.js"
