<#
.SYNOPSIS
    新建一份交接记录（从 docs/handoffs/TEMPLATE.md 拷贝）。

.DESCRIPTION
    交接记录是"换 AI 平台"的读档点：上一个 AI 留下它，下一个 AI 从它接手。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/new-handoff.ps1 rerank-bge-eval
    powershell -ExecutionPolicy Bypass -File scripts/new-handoff.ps1 卡片出处
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Slug
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent $PSScriptRoot
$Template = Join-Path $Root 'docs\handoffs\TEMPLATE.md'
$Dir = Join-Path $Root 'docs\handoffs'

if (-not (Test-Path -LiteralPath $Template)) {
    throw "找不到模板：$Template"
}

# 文件名里的中文与空格都换成安全字符
$safe = ($Slug -replace '[\\/:*?"<>|]', '-') -replace '\s+', '-'
$safe = $safe.Trim('-')
if (-not $safe) { throw 'Slug 不能为空' }

$stamp = Get-Date -Format 'yyyy-MM-dd-HHmm'
$target = Join-Path $Dir "$stamp-$safe.md"

if (Test-Path -LiteralPath $target) {
    throw "同名文件已存在：$target"
}

Copy-Item -LiteralPath $Template -Destination $target

Write-Output "已创建：$(Resolve-Path -Relative $target)"
Write-Output ''
Write-Output '接下来让 AI 基于本次会话的真实内容填写它（见 prompts/HANDOFF.md），人只审阅不代写。'
