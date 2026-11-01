# Packages the Windows installer from a local staging copy.
# electron-builder walks the whole project directory, which fails on network shares
# when a delete-pending (.msys*) entry is present; staging the few files it needs on
# the local disk avoids that. Output lands in dist\win\.
#   powershell -ExecutionPolicy Bypass -File scripts/package-win.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $env:LOCALAPPDATA 'Temp\fritterzing-package'
$out = Join-Path $root 'dist\win'

Set-Location $root
Write-Output "Building renderer/main bundles..."
npx electron-vite build | Out-Null

if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item -Recurse (Join-Path $root 'out') (Join-Path $stage 'out')
Copy-Item -Recurse (Join-Path $root 'build') (Join-Path $stage 'build')
Copy-Item (Join-Path $root 'DISCLAIMER.md'), (Join-Path $root 'LICENSE'), (Join-Path $root 'electron-builder.yml') $stage

# package.json without dependencies: everything the app needs is bundled in out/.
$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$electronVersion = ((Get-Content (Join-Path $root 'node_modules\electron\package.json') -Raw | ConvertFrom-Json).version)
$stagePkg = [ordered]@{
  name = $pkg.name; productName = $pkg.productName; version = $pkg.version; description = $pkg.description
  main = $pkg.main; author = $pkg.author; license = $pkg.license; private = $true
  devDependencies = @{ electron = $electronVersion }
}
# Write without a byte-order mark (Set-Content -Encoding utf8 adds one in Windows PowerShell 5.1).
[System.IO.File]::WriteAllText((Join-Path $stage 'package.json'), ($stagePkg | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
# electron-builder resolves the electron version from node_modules; point it at the project's copy.
New-Item -ItemType Directory -Force (Join-Path $stage 'node_modules') | Out-Null
New-Item -ItemType Junction -Path (Join-Path $stage 'node_modules\electron') -Target (Join-Path $root 'node_modules\electron') | Out-Null

Write-Output "Packaging in $stage ..."
Set-Location $stage
& (Join-Path $root 'node_modules\.bin\electron-builder.cmd') --win --project $stage --config electron-builder.yml
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed with exit code $LASTEXITCODE" }

New-Item -ItemType Directory -Force $out | Out-Null
Get-ChildItem (Join-Path $stage 'release') -File | Where-Object { $_.Extension -in '.exe', '.blockmap' -or $_.Name -eq 'latest.yml' } | ForEach-Object { Copy-Item $_.FullName $out -Force }
Set-Location $root
Write-Output "Done. Installers:"
Get-ChildItem $out\*.exe | ForEach-Object { "  {0}  {1:N1} MB" -f $_.Name, ($_.Length / 1MB) }
