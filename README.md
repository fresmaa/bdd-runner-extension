# BDD Scenario Runner Extension

VS Code extension internal untuk menjalankan scenario `.feature` cukup dengan 1 klik tombol.

## Fitur

- Tombol `Run Current Scenario Tag` di title bar editor file `.feature`
- Ikon `Run` (start/play) di gutter kiri setiap baris `Scenario`
- Command palette: `BDD Runner: Run Current Scenario`
- Command palette: `BDD Runner: Run Current Feature`
- Command palette: `BDD Runner: Re-run Failed`
- Otomatis membaca scenario aktif berdasarkan posisi cursor
- Menjalankan berdasarkan nama scenario agar tidak bentrok tag
- Menampilkan output log run di Test Results
- Auto-detect shell (PowerShell, Git Bash, CMD) agar command quoting tetap aman
- Opsi mode saat run: `Headless` atau `Headed`
- Default run extension tidak membuka HTML report
- Menjalankan command default:

```bash
pnpm bddgen && pnpm playwright test --grep "ASN successfully accesses the INAgov portal and verifies UI components" --headed
```

## Cara Pakai

1. Buka file `.feature`.
2. Letakkan cursor di dalam scenario yang ingin dijalankan.
3. Klik tombol play `Run Current Scenario` di pojok kanan atas editor.
4. Atau klik ikon `Run` di kiri baris `Scenario`.
5. Pilih mode `Headless` atau `Headed`.
6. Extension menjalankan command test di terminal `BDD Scenario Runner`.

Untuk run semua scenario dalam satu file feature, gunakan command `BDD Runner: Run Current Feature`.

## Konfigurasi

Bisa diubah lewat `Settings`:

- `bddScenarioRunner.commandTemplate`
  - Default: `pnpm bddgen && pnpm playwright test --grep {scenarioQuoted}{headedFlag}`
  - Placeholder: `{scenario}`, `{scenarioQuoted}`, `{featurePath}`, `{featurePathQuoted}`, `{runMode}`, `{headedFlag}`
- `bddScenarioRunner.featureCommandTemplate`
  - Default: `pnpm bddgen && pnpm playwright test --grep {featureNameQuoted}{headedFlag}`
  - Placeholder: `{featureName}`, `{featureNameQuoted}`, `{featurePath}`, `{featurePathQuoted}`, `{runMode}`, `{headedFlag}`
- `bddScenarioRunner.rerunFailedCommandTemplate`
  - Default: `pnpm bddgen && pnpm playwright test --last-failed{headedFlag}`
- `bddScenarioRunner.terminalName`
  - Default: `BDD Scenario Runner`
- `bddScenarioRunner.autoClearTerminal`
  - Default: `true`
- `bddScenarioRunner.showTerminalOnRun`
  - Default: `false`
- `bddScenarioRunner.askRunMode`
  - Default: `true`
- `bddScenarioRunner.defaultRunMode`
  - Default: `headless`

## Build VSIX (untuk dibagikan ke tim)

```bash
cd d:/QA/bdd-runner-extension
npm install
npm run compile
npm run package
```

File `.vsix` akan terbuat di folder ini, lalu bisa dibagikan ke tim.

## Install VSIX

Di VS Code:

1. Buka `Extensions`
2. Klik `...` (More Actions)
3. Pilih `Install from VSIX...`
4. Pilih file `.vsix`
