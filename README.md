# tabby-mingze-tearoff

Tabby plugin that detaches tabs into a new window.

## Features

- Drag a tab outside the current window to detach it
- Tab context menu action: `分离到新窗口`
- Hotkey command: `tearoff-tab`
- Tab transfer uses Tabby recovery tokens instead of profile only cloning

## Notes

- Local terminal tabs (`app:local-tab`) usually preserve session continuity better because recovery data carries `restoreFromPTYID`.
- Non local tabs depend on each tab type recovery provider.
- Pending tear off requests are stored for a short time in `localStorage` and expired entries are cleaned up automatically.

## Build

```bash
yarn install
yarn typecheck
yarn build
```

Development build and watch:

```bash
yarn build:dev
yarn watch
```

If you previously tried to build with `node-sass`, clear old dependencies first:

```bash
rm -rf node_modules yarn.lock
yarn install
```

Windows PowerShell:

```powershell
rmdir /s /q node_modules
del yarn.lock
yarn install
```

## Config

Default config registered by this plugin:

```yaml
mingzeTearoff:
  enableDragOut: true
  dragOutMargin: 0
  maxPendingAgeMS: 60000
hotkeys:
  tearoff-tab: []
```

- `maxPendingAgeMS` controls how long a pending detach request stays valid.
- You can bind `tearoff-tab` in Tabby hotkey settings.
