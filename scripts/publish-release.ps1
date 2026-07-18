param(
  [string]$Version = "0.3.5"
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
  Write-Error "GitHub CLI no encontrado. Instalá con: winget install GitHub.cli"
}

$auth = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Primero iniciá sesión en GitHub:" -ForegroundColor Yellow
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
  Write-Error "No se encontró el instalador en release\* Setup $Version.exe"
}

$exe = (Resolve-Path $exePath).Path
$exeName = Split-Path $exe -Leaf

$notes = @"
## ControlStock v$Version

Inventario offline entre celulares (hotspot P2P), APK Android y pulido del flujo de conteo sin red al PC.

### Nuevo
- **Inventario offline:** sectores OFFLINE, paquete en celular, conteo local y sync P2P por hotspot (puerto 3850)
- **Comparación A + reconteo** en celular; import al PC y Comparación B vs sistema
- **APK Capacitor Android** para terminal de bodega
- **Escanear QR del compañero** al conectar sync P2P

### Mejorado
- Sync P2P más robusto (reintentos, espera del host, recuperar comparación)
- Banner de inventario compacto en móvil; edición de líneas en reconteo offline
- Import al PC más seguro (verifica en servidor antes de borrar datos locales)

### Actualización
- Desde **v0.2.7 o superior:** Configuración → Buscar actualizaciones
- O instalá el ``.exe`` de este release manualmente

Login inicial: **admin** / **admin123**
"@

Write-Host "Publicando release $tag..." -ForegroundColor Green

$existing = gh release view $tag 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "El release $tag ya existe. Subiendo instalador..." -ForegroundColor Yellow
  gh release upload $tag $exe --clobber
} else {
  gh release create $tag $exe --title "ControlStock v$Version" --notes $notes
}

if ($LASTEXITCODE -eq 0) {
  $url = gh release view $tag --json url -q .url
  Write-Host ""
  Write-Host "Release publicado:" -ForegroundColor Green
  Write-Host $url -ForegroundColor Cyan
} else {
  Write-Error "No se pudo publicar el release."
}
