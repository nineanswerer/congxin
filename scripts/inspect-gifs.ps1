# inspect-gifs.ps1 — 读取刘看山动态素材的帧信息并拼出对照图
#
# 用途：
#   1. 读出每个 GIF 的帧数、尺寸、是否透明
#   2. 把所有帧横向拼成一张 contact sheet，便于一次看清每个动作
#
# 依赖：System.Drawing（GDI+），Windows 自带，无需安装额外工具。
# 用法：powershell -ExecutionPolicy Bypass -File scripts\inspect-gifs.ps1

[CmdletBinding()]
param(
  [string]$SourceDir = (Join-Path $PSScriptRoot '..\docs\sources\kanshan_material\dynamic'),
  [string]$OutSheet  = (Join-Path $PSScriptRoot '..\docs\sources\kanshan_material\contact-sheet.png'),
  [int]$SamplePerAction = 6,
  [int]$Cell = 130
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing

$files = Get-ChildItem -LiteralPath $SourceDir -Filter '*.gif' | Sort-Object Name
if (-not $files) { throw "目录里没有 GIF：$SourceDir" }

# 收集所有帧
$allFrames = New-Object System.Collections.Generic.List[System.Drawing.Bitmap]
$label = New-Object System.Collections.Generic.List[string]

foreach ($file in $files) {
  $img = [System.Drawing.Image]::FromFile($file.FullName)
  try {
    $dim = New-Object System.Drawing.Imaging.FrameDimension($img.FrameDimensionsList[0])
    $count = $img.GetFrameCount($dim)
    $fmt = $img.PixelFormat
    $hasAlpha = ([System.Drawing.Image]::IsAlphaPixelFormat($fmt))
    Write-Output ('{0,-20} {1}x{2}  frames={3}  alpha={4}  {5} KB' -f `
      $file.Name, $img.Width, $img.Height, $count, $hasAlpha, [math]::Round($file.Length/1KB,0))

    for ($i = 0; $i -lt $count; $i++) {
      # 每个动作只均匀抽取若干帧，避免对照图过长
      $take = $false
      if ($SamplePerAction -le 0 -or $count -le $SamplePerAction) {
        $take = $true
      } else {
        $step = ($count - 1) / ($SamplePerAction - 1)
        for ($s = 0; $s -lt $SamplePerAction; $s++) {
          if ($i -eq [math]::Round($s * $step)) { $take = $true; break }
        }
      }
      if (-not $take) { continue }
      [void]$img.SelectActiveFrame($dim, $i)
      $bmp = New-Object System.Drawing.Bitmap($img.Width, $img.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.Clear([System.Drawing.Color]::Transparent)
      $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0,0,$img.Width,$img.Height)))
      $g.Dispose()
      $allFrames.Add($bmp)
      $label.Add(($file.BaseName + ' f' + $i))
    }
  } finally {
    $img.Dispose()
  }
}

# 拼成一张横向长图：每行一个动作
$cols = $SamplePerAction
$rows = [math]::Ceiling($allFrames.Count / $cols)
$cell = $Cell
$labelH = 22
$sheet = New-Object System.Drawing.Bitmap(($cols * $cell), ($rows * ($cell + $labelH)), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.Clear([System.Drawing.Color]::FromArgb(255, 245, 245, 245))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$font = New-Object System.Drawing.Font('Consolas', 11)
$brush = [System.Drawing.Brushes]::Black

for ($i = 0; $i -lt $allFrames.Count; $i++) {
  $col = $i % $cols
  $row = [math]::Floor($i / $cols)
  $x = $col * $cell
  $y = $row * ($cell + $labelH)
  $g.DrawImage($allFrames[$i], $x, $y, $cell, $cell)
  $g.DrawString($label[$i], $font, $brush, ($x + 4), ($y + $cell + 3))
}
$g.Dispose()
$sheet.Save($OutSheet, [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()
foreach ($b in $allFrames) { $b.Dispose() }

Write-Output ''
Write-Output ('Contact sheet: ' + $OutSheet)
