# Changelog

All notable changes to this project will be documented in this file.

This format is inspired by Keep a Changelog and follows semantic versioning.

## [Unreleased]

## [1.0.2] - 2026-05-02

### Added
- Added Run at Cursor command to run scenario or example rows using the default run mode.
- Added status bar run summary with passed/failed/skipped/errored counts and duration for Testing Panel runs.
- Added terminal run behavior setting (transient vs persistent) and status bar updates for terminal runs.

### Fixed
- Fixed duplicated output lines in Testing Panel runs.
- Preserved blank lines in command output streaming.

## [1.0.0] - 2026-04-12

### Changed
- Rebranded user-facing extension name to Playwright BDD Runner across marketplace metadata, commands category labels, docs, terminal defaults, and runtime messages.

## [0.1.37] - 2026-04-11

### Added
- Added a stronger stop flow for feature runs in Testing API so stopping a run cancels remaining scenarios in the same batch.
- Added clearer cancellation messaging in test run output when user-triggered stop is applied.

### Changed
- Improved stop command UX feedback to distinguish test-batch cancellation, terminal interruption, and background process termination.
- Refreshed command icons with higher-contrast colors for better visibility in dark and light themes.

### Fixed
- Fixed behavior where pressing stop during feature execution could still allow subsequent scenarios to continue.
- Improved command execution resilience around scenario matching and retry path for no-test-found conditions in shell execution flow.

## [0.1.36] - 2026-04-11

### Added
- Published previous patch release with refactor, docs, and run-command reliability improvements.

[Unreleased]: https://github.com/fresmaa/bdd-runner-extension/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/fresmaa/bdd-runner-extension/compare/v1.0.0...v1.0.2
[1.0.0]: https://github.com/fresmaa/bdd-runner-extension/compare/v0.1.37...v1.0.0
[0.1.37]: https://github.com/fresmaa/bdd-runner-extension/compare/v0.1.36...v0.1.37
[0.1.36]: https://github.com/fresmaa/bdd-runner-extension/releases/tag/v0.1.36
