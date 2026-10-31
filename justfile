# Task runner for opencode-easy-vision. Run `just` to list recipes.

set shell := ["bash", "-euo", "pipefail", "-c"]

# List available recipes
default:
    @just --list --unsorted

# Install dependencies exactly as locked
install:
    npm ci

# Compile src/ to dist/
build:
    npm run build

# Run tests once; extra args go to Vitest (e.g. `just test config`)
test *args:
    npm test -- {{ args }}

# Re-run tests on change
watch *args:
    npm run test:watch -- {{ args }}

# Run tests and enforce coverage thresholds (HTML report in coverage/)
coverage:
    npm run test:coverage

# Type-check sources and tests without emitting
typecheck:
    npm run typecheck

# Format src/ and test/
fmt:
    npm run format

# Fail if anything is unformatted
fmt-check:
    npm run format:check

# Everything CI runs, in the same order
check: fmt-check build typecheck coverage

# End-to-end tests: installs the packed plugin and drives the local `opencode` binary
e2e: build
    npm run test:e2e

# Remove build and coverage output
clean:
    rm -rf dist coverage

# Bump version (patch|minor|major), commit, tag, and push; CI publishes to npm
[confirm("Bump the version, tag, and push? CI will publish to npm.")]
release level: check
    npm version {{ level }}
    git push --follow-tags
