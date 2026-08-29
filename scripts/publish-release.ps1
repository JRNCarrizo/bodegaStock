param(
  [string]$Version = "0.3.60"
)

$ErrorActionPreference = "Stop"
$tag = "v$Version"
$root = Join-Path $PSScriptRoot ".."
Set-Location $root

$exeCandidates = @(
  (Join-Path $root "release\ControlStock-Setup-$Version.exe"),
  (Join-Path $root "release\ControlStock Setup $Version.exe"),
  (Join-Path $root "release\BodegaStock Setup $Version.exe")
)

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Error "GitHub CLI no encontrado. Instala con: winget install GitHub.cli"
}

$auth = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Primero inicia sesion en GitHub:" -ForegroundColor Yellow
  Write-Host "  gh auth login" -ForegroundColor Cyan
  Write-Host ""
  Write-Host $auth
  exit 1
}

$exePath = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $exePath) {
  Write-Host "Generando instalador (npm run dist)..." -ForegroundColor Yellow
  npm run dist
  $exePath = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (-not $exePath) {
  $found = Get-ChildItem (Join-Path $root "release") -Filter "*Setup $Version.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) { $exePath = $found.FullName }
}

if (-not $exePath) {
  Write-Error "No se encontro el instalador en release\* Setup $Version.exe"
}

$exe = (Resolve-Path $exePath).Path
$exeSize = (Get-Item $exe).Length
if ($exeSize -lt 100MB) {
  Write-Error "Setup demasiado chico ($exeSize bytes). Regenera con npm run dist."
}

$apkPath = Join-Path $root "release\ControlStock-$Version.apk"
$assets = @($exe)
if (Test-Path $apkPath) { $assets += (Resolve-Path $apkPath).Path }
$ymlPath = Join-Path $root "release\latest.yml"
if (Test-Path $ymlPath) { $assets += (Resolve-Path $ymlPath).Path }

$notes = @"
## ControlStock v$Version

Corrige la instalación automática: al tocar Instalar y reiniciar ya no se suicida el script (consolas de timeout) y abre el Setup.

### Importante (esta vez)
- Instalá **a mano** ``ControlStock-Setup-$Version.exe`` desde este release.
- El botón de actualizar de la 0.3.60 todavía tiene el bug; recién con $Version instalada las próximas actualizaciones deberían abrirse solas.

### Otros
- Menos golpes a GitHub al buscar actualizaciones (sin forzar cooldown en cada clic).
- Setup PC + APK alineados (``ControlStock-Setup-$Version.exe`` y ``ControlStock-$Version.apk``).

### Actualizacion
1. Cerra ControlStock.
2. PC: instalá ``ControlStock-Setup-$Version.exe``.
3. Celular: instalá ``ControlStock-$Version.apk`` si corresponde.

Login inicial (base vacia): **admin** / **admin123**
"@

Write-Host "Publicando release $tag (Setup $([math]::Round($exeSize/1MB,2)) MB)..." -ForegroundColor Green

$existing = $null
try {
  $existing = gh release view $tag 2>$null
} catch {
  $existing = $null
}
$notesPath = Join-Path $root "release\release-notes-$Version.md"
$notes | Set-Content -Path $notesPath -Encoding utf8

if ($LASTEXITCODE -eq 0 -and $existing) {
  Write-Host "El release $tag ya existe. Subiendo assets..." -ForegroundColor Yellow
  gh release upload $tag @assets --clobber
} else {
  $global:LASTEXITCODE = 0
  gh release create $tag @assets --title "ControlStock v$Version" --notes-file $notesPath
}

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Start-Sleep -Seconds 2
$releaseJson = gh api "repos/JRNCarrizo/bodegaStock/releases/tags/$tag" | ConvertFrom-Json
$remoteSize = [int64](($releaseJson.assets | Where-Object { $_.name -like '*Setup*' } | Select-Object -First 1).size)
Write-Host "GitHub Setup size: $remoteSize (local $exeSize)" -ForegroundColor Cyan
if ($remoteSize -ne $exeSize) {
  Write-Host "Tamano distinto - reintentando upload con clobber..." -ForegroundColor Yellow
  gh release upload $tag $exe --clobber
  Start-Sleep -Seconds 3
  $releaseJson = gh api "repos/JRNCarrizo/bodegaStock/releases/tags/$tag" | ConvertFrom-Json
  $remoteSize = [int64](($releaseJson.assets | Where-Object { $_.name -like '*Setup*' } | Select-Object -First 1).size)
  if ($remoteSize -ne $exeSize) {
    Write-Error "Setup en GitHub sigue truncado: $remoteSize vs $exeSize. Subi a mano."
  }
}

if (Test-Path $apkPath) {
  $apkSize = (Get-Item $apkPath).Length
  $remoteApk = [int64](($releaseJson.assets | Where-Object { $_.name -like '*.apk' } | Select-Object -First 1).size)
  Write-Host "GitHub APK size: $remoteApk (local $apkSize)" -ForegroundColor Cyan
}

Write-Host "Listo: https://github.com/JRNCarrizo/bodegaStock/releases/tag/$tag" -ForegroundColor Green
