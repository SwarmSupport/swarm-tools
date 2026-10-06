# Repository Guidelines

## Project Structure & Module Organization

The desktop app lives at the repository root: `main.js` manages Electron and the core process, `preload.js` exposes IPC, and `renderer.js`, `index.html`, and `styles.css` implement the interface. Root-level helpers handle macOS integration, certificates, presets, and Python-backed configuration and platform storage. `st-core/` contains the Go CLI, internal packages, default `config.yaml`, and provider IP lists. `mobile/android/` and `mobile/ios/` contain native entry points; read `mobile/README.md` before changing them, since packet forwarding is unfinished. Put JavaScript and Python tests in `test/`, Go tests beside their packages, and static images in `assets/`.

## Build, Test, and Development Commands

- `npm install` installs desktop dependencies; `python3 -m pip install PyYAML` supplies the configuration bridge.
- `npm start` builds `bin/st-core` and launches Electron. `npm run build:core` builds only the Go executable.
- `npm test` runs Node's built-in test runner and Python `unittest` discovery.
- `cd st-core && go test ./...` runs Go package tests; `go build -o st-core ./cmd/st-core` builds the CLI within that directory.
- `npm run build:mobile:android` or `npm run build:mobile:ios` generates mobile bindings when the platform SDK is installed.

## Coding Style & Naming Conventions

Match nearby code: JavaScript uses two-space indentation, semicolons, CommonJS imports, and `camelCase` names; Python uses four spaces and `snake_case`; Go uses `gofmt` and exported `PascalCase` names. Keep platform-specific behavior in its existing helper or native module. No repository-wide lint or formatter configuration is present, so avoid unrelated formatting changes.

## Testing Guidelines

Add focused regression tests for changed behavior. Name JavaScript tests `test/*.test.js`, Python tests `test/test_*.py`, and Go tests `*_test.go` beside the code. Run `npm test` and `cd st-core && go test ./...` before proposing a change that touches those areas. No coverage threshold is configured.

## Commits & Pull Requests

This checkout has no Git history from which to infer a commit convention. Use a short imperative subject describing the change, such as `Fix DNS routing cleanup`. Pull requests should explain the behavior, include test commands and results, link related issues when applicable, and add screenshots for visible UI changes. Keep generated binaries, mobile bindings, certificates, keys, and local caches out of commits; see `.gitignore`.
