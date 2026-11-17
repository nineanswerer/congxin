<#
.SYNOPSIS
    新建一条决策记录 ADR（从 docs/adr/TEMPLATE.md 拷贝，自动编号）。

.DESCRIPTION
    ADR 记录"为什么这么定"和"否决了什么"。规则见 docs/adr/README.md。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/new-adr.ps1 use-bge-reranker
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Slug
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent $PSScriptRoot
$Template = Join-Path $Root 'docs\adr\TEMPLATE.md'
$Dir = Join-Path $Root 'docs\adr'

if (-not (Test-Path -LiteralPath $Template)) {
    throw "找不到模板：$Template"
}

$safe = ($Slug -replace '[\\/:*?"<>|]', '-') -replace '\s+', '-'
$safe = $safe.Trim('-')
if (-not $safe) { throw 'Slug 不能为空' }

$max = 0
Get-ChildItem -LiteralPath $Dir -Filter 'ADR-*.md' -File -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.BaseName -match '^ADR-(\d{4})') {
        $n = [int]$Matches[1]
        if ($n -gt $max) { $max = $n }
    }
}
$next = '{0:D4}' -f ($max + 1)
$target = Join-Path $Dir "ADR-$next-$safe.md"

if (Test-Path -LiteralPath $target) {
    throw "同名文件已存在：$target"
}

Copy-Item -LiteralPath $Template -Destination $target
$content = [System.IO.File]::ReadAllText($target, [System.Text.Encoding]::UTF8)
$content = $content.Replace('# ADR-0000 · <一句话标题>', "# ADR-$next · <一句话标题>")
[System.IO.File]::WriteAllText($target, $content, (New-Object System.Text.UTF8Encoding($false)))

Write-Output "已创建：$(Resolve-Path -Relative $target)"
Write-Output ''
Write-Output '注意：模板里的「被否决的方案」一节不许空——那是最值钱的部分。规则见 docs/adr/README.md'
