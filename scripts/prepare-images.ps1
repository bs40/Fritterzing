# Prepares the branding images in img/ for use in the app:
#  - keys the solid black background of the logo and icon to transparent
#    (only neutral dark pixels; the dark-navy artwork is chromatic and kept)
#  - writes resized copies for the renderer, the installer icon and the README.
# Run from the project root:  powershell -ExecutionPolicy Bypass -File scripts/prepare-images.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot

function Key-Black([System.Drawing.Bitmap]$src) {
  $bmp = New-Object System.Drawing.Bitmap($src.Width, $src.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.DrawImage($src, 0, 0, $src.Width, $src.Height); $g.Dispose()
  $rect = New-Object System.Drawing.Rectangle(0, 0, $bmp.Width, $bmp.Height)
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $len = $data.Stride * $bmp.Height
  $bytes = New-Object byte[] $len
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $len)
  for ($i = 0; $i -lt $len; $i += 4) {
    $b = $bytes[$i]; $gg = $bytes[$i + 1]; $r = $bytes[$i + 2]
    $max = [Math]::Max($r, [Math]::Max($gg, $b)); $min = [Math]::Min($r, [Math]::Min($gg, $b))
    if ($max -lt 56 -and ($max - $min) -lt 14) {
      # neutral dark pixel: background or an anti-aliased edge against it
      $alpha = [int][Math]::Min(255, [Math]::Round($max * 255 / 56))
      if ($alpha -lt 24) { $alpha = 0 }
      $bytes[$i + 3] = [byte]$alpha
      if ($alpha -gt 0) { $bytes[$i] = 255; $bytes[$i + 1] = 255; $bytes[$i + 2] = 255 } # edge pixels blend towards the white outline
    }
  }
  [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $len)
  $bmp.UnlockBits($data)
  return $bmp
}

function Save-Resized([System.Drawing.Bitmap]$src, [string]$path, [int]$width) {
  $height = [int][Math]::Round($src.Height * $width / $src.Width)
  $out = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($src, 0, 0, $width, $height); $g.Dispose()
  New-Item -ItemType Directory -Force (Split-Path -Parent $path) | Out-Null
  $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $out.Dispose()
  Write-Output ("{0}  {1}x{2}  {3} KB" -f $path.Replace($root + '\', ''), $width, $height, [int]((Get-Item $path).Length / 1024))
}

$assets = Join-Path $root 'src\renderer\src\assets'
$public = Join-Path $root 'src\renderer\public'

$logo = Key-Black ([System.Drawing.Bitmap]::FromFile((Join-Path $root 'img\Fritterzing Parts Editor Logo.png')))
Save-Resized $logo (Join-Path $assets 'logo.png') 1200
Save-Resized $logo (Join-Path $root 'docs\logo.png') 900

$icon = Key-Black ([System.Drawing.Bitmap]::FromFile((Join-Path $root 'img\Glossy F-Circuit Breadboard Icon.png')))
Save-Resized $icon (Join-Path $root 'build\icon.png') 1024
Save-Resized $icon (Join-Path $assets 'icon.png') 256
Save-Resized $icon (Join-Path $public 'favicon.png') 64

$sticker = [System.Drawing.Bitmap]::FromFile((Join-Path $root 'img\Glossy F Circuit Breadboard Sticker.png'))
Save-Resized $sticker (Join-Path $assets 'sticker.png') 640
Save-Resized $sticker (Join-Path $root 'docs\sticker.png') 320
