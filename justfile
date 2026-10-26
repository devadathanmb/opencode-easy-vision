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
    npx vitest run {{ args }}

# Re-run tests on change
watch *args:
    npx vitest {{ args }}

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

# End-to-end run against the installed OpenCode binary using the checkout
runtime: build
    node scripts/v2-spike/run.mjs "$PWD/dist/index.js"

# Pack, install into a clean temp project, and run the end-to-end fixture against it
runtime-pack: build
    #!/usr/bin/env bash
    set -euo pipefail
    work="$(mktemp -d "${TMPDIR:-/tmp}/easy-vision-pack-XXXXXX")"
    npm pack --ignore-scripts --pack-destination "$work" >/dev/null
    (cd "$work" && npm init -y >/dev/null && npm install --ignore-scripts --no-audit --no-fund ./opencode-easy-vision-*.tgz >/dev/null)
    echo "Installed packages: $(ls "$work/node_modules" | tr '\n' ' ')"
    node scripts/v2-spike/run.mjs "$work/node_modules/opencode-easy-vision/dist/index.js"

# Remove build and coverage output
clean:
    rm -rf dist coverage

# Bump version (patch|minor|major), commit, tag, and push; CI publishes to npm
[confirm("Bump the version, tag, and push? CI will publish to npm.")]
release level: check
    npm version {{ level }}
    git push --follow-tags
