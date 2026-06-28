param(
  [string]$Version = "0.2.1"
)

$ErrorActionPreference = "Stop"
$tag = "v$Version"
$root = Join-Path $PSScriptRoot ".."
Set-Location $root

$exeCandidates = @(
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

Nueva versión con red local, etiquetas de barras y mejoras de interfaz.

### Nuevo
- **Servidor / cliente en red:** una PC servidor y otras PCs conectadas por WiFi/LAN (puerto 3847)
- **Configuración de red:** modo servidor o cliente, probar conexión, URLs y QR para celulares
- **Etiquetas de código de barras:** generar, imprimir y descargar PNG desde Productos
- **Configuración:** pantalla de actualizaciones y red
- **Detalle unificado** en ingresos, retornos, roturas, planillas y movimientos

### Incluye (base)
- Productos, sectores, consulta, ingresos, planillas, retornos, roturas, movimientos internos
- Reportes, usuarios, camioneros y permisos

### Instalación
1. **PC servidor:** instalá ``$exeName`` → Configuración → *Esta PC es el servidor*
2. **Otras PCs:** mismo instalador → Configuración → *Esta PC es cliente* → IP del servidor → puerto **3847**

Login inicial: **admin** / **admin123** (cambiar después del primer acceso).

### Datos
La base de datos del servidor se guarda en ``%APPDATA%\ControlStock\data\`` en la PC servidor.
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
