## [2.1.0](https://github.com/mykola-mokhnach/appium-devtools-plugin/compare/v2.0.2...v2.1.0) (2026-08-01)

### Features

* e2e coverage ([#85](https://github.com/mykola-mokhnach/appium-devtools-plugin/issues/85)) ([2da88bf](https://github.com/mykola-mokhnach/appium-devtools-plugin/commit/2da88bf3cf6308d0cc6acdeb04e13699302326bd))

## [2.0.2](https://github.com/mykola-mokhnach/appium-devtools-plugin/compare/v2.0.1...v2.0.2) (2026-08-01)

### Miscellaneous Chores

* Drop chai ([#83](https://github.com/mykola-mokhnach/appium-devtools-plugin/issues/83)) ([e33029b](https://github.com/mykola-mokhnach/appium-devtools-plugin/commit/e33029bc8f733ebb0303405ec9c7bca8ce479c84))

## [2.0.1](https://github.com/mykola-mokhnach/appium-devtools-plugin/compare/v2.0.0...v2.0.1) (2026-08-01)

### Miscellaneous Chores

* Integrate oxc and release configs ([#82](https://github.com/mykola-mokhnach/appium-devtools-plugin/issues/82)) ([8cb3105](https://github.com/mykola-mokhnach/appium-devtools-plugin/commit/8cb31058c3f815b73fd8b80f232da3a5f1562f75))

## [2.0.0](https://github.com/mykola-mokhnach/appium-devtools-plugin/compare/v1.0.3...v2.0.0) (2026-08-01)

### ⚠ BREAKING CHANGES

* appium-devtools-plugin is now an ESM-only package. It can no longer be loaded via CommonJS require(); consumers must use import or dynamic import(). Deep imports into the package's internals are no longer possible — only the public entry point is exposed via exports.

### Features

* Migrate the package to ESM ([#81](https://github.com/mykola-mokhnach/appium-devtools-plugin/issues/81)) ([f87fd35](https://github.com/mykola-mokhnach/appium-devtools-plugin/commit/f87fd35792fe5fbc8b2a73eedffbc402f7f1f27f))

## [1.0.3](https://github.com/mykola-mokhnach/appium-devtools-plugin/compare/v1.0.2...v1.0.3) (2026-05-06)

### Bug Fixes

* linter ([#67](https://github.com/mykola-mokhnach/appium-devtools-plugin/issues/67)) ([c1e815f](https://github.com/mykola-mokhnach/appium-devtools-plugin/commit/c1e815f67aae13bf552a48dc4533ee5d5597553c))

## [1.0.2](https://github.com/mykola-mokhnach/appium-devtools-plugin/compare/v1.0.1...v1.0.2) (2026-03-09)

### Miscellaneous Chores

* Drop bluebird and lodash usages ([#63](https://github.com/mykola-mokhnach/appium-devtools-plugin/issues/63)) ([ff93766](https://github.com/mykola-mokhnach/appium-devtools-plugin/commit/ff93766972f2e184358c8f9f41639b4bf652b695))

## [1.0.1](https://github.com/mykola-mokhnach/appium-devtools-plugin/compare/v1.0.0...v1.0.1) (2026-01-16)

### Bug Fixes

* Tune functional tests config ([#56](https://github.com/mykola-mokhnach/appium-devtools-plugin/issues/56)) ([2264187](https://github.com/mykola-mokhnach/appium-devtools-plugin/commit/2264187d0ea05fb0ee59f432abbba5fa5af16d00))

## [1.0.0](https://github.com/mykola-mokhnach/appium-devtools-plugin/compare/v0.1.1...v1.0.0) (2026-01-16)

### ⚠ BREAKING CHANGES

* The minimum required Appium server version is set to 3.0.0

### Features

* Make the plugin compatible with Appium 3 ([#35](https://github.com/mykola-mokhnach/appium-devtools-plugin/issues/35)) ([f17d08d](https://github.com/mykola-mokhnach/appium-devtools-plugin/commit/f17d08deb77a8e0a54d619f7ac645f74dac83bc1))
* Migrate to typescript ([#54](https://github.com/mykola-mokhnach/appium-devtools-plugin/issues/54)) ([f38e240](https://github.com/mykola-mokhnach/appium-devtools-plugin/commit/f38e24008f4b031e8944a4a8fb69c69ab22c1f06))

### Miscellaneous Chores

* Use latest types ([b57789a](https://github.com/mykola-mokhnach/appium-devtools-plugin/commit/b57789afb8e0fb343d116f225a34b56e567344bb))
