#!/bin/bash

ARGS=(./test/functional/*.e2e.spec.js --exit --timeout 10m)
npx mocha "${ARGS[@]}"
