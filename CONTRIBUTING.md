# Contributing

## Local Development

### 1. Install dependencies and build

```bash
npm install
npm run build
```

The compiled plugin will be at `dist/index.js`.

Husky is configured as a `prepare` script and installs automatically on `npm install`. The pre-commit hook runs `npm run format` to ensure all committed code is properly formatted. To skip the hook for a commit, use `git commit --no-verify`.

### 2. Symlink into OpenCode's plugin directory

```bash
mkdir -p ~/.config/opencode/plugin
ln -sf $(pwd)/dist/index.js ~/.config/opencode/plugin/opencode-easy-vision.js
```

Restart OpenCode to pick up the symlinked plugin.

### 3. Rebuild on changes

```bash
npm run build
```

OpenCode loads plugins at startup, so restart it after each rebuild to test changes.

## Code Style

```bash
npm run format        # format src/
npm run format:check  # check without writing
```

The project uses Prettier with the config in `.prettierrc.json`.

## CI

CI runs on every push via GitHub Actions (`.github/workflows/ci.yml`). It checks formatting and runs a build. Publishing to npm is gated on CI passing.
