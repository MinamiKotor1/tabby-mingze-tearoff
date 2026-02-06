# tabby-mingze-tearoff

Tabby plugin that detaches tabs into a new window.

## Features

- Drag a tab outside the current window to detach it
- Tab context menu action: `分离到新窗口`
- Hotkey command: `tearoff-tab`
- State transfer uses Tabby recovery tokens (`includeState: true`)

## Notes

- Lossless transfer is guaranteed for local terminal tabs (`app:local-tab`) because they carry `restoreFromPTYID`.
- Non-local terminal tabs can still be detached, but behavior depends on each tab type's recovery provider.
- Scrollback restore is limited by Tabby's xterm serialization behavior.

## Build

```bash
yarn install
yarn build
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

You can bind `tearoff-tab` in Tabby hotkey settings.
