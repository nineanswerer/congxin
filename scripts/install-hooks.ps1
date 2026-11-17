<#
.SYNOPSIS
    安装 git hooks（强制 commit 信息带 Context / Tried / Verify 三行）。

.DESCRIPTION
    把 core.hooksPath 指向仓库内的 .githooks 目录。
    Git for Windows 自带 sh，.githooks/commit-msg 里的 POSIX 脚本可以直接跑，
    不需要装任何额外东西。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/install-hooks.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent $PSScriptRoot
$HooksDir = Join-Path $Root '.githooks'
$Hook = Join-Path $HooksDir 'commit-msg'

if (-not (Test-Path -LiteralPath $Hook)) {
    throw "找不到 hook 文件：$Hook"
}

git -C $Root config core.hooksPath '.githooks'
if ($LASTEXITCODE -ne 0) { throw '设置 core.hooksPath 失败' }

$current = (git -C $Root config --get core.hooksPath)
Write-Output "core.hooksPath = $current"

Write-Output ''
Write-Output '已安装。接下来提交时会被检查：'
Write-Output '  - 标题格式 <type>(<scope>): <祈使句>'
Write-Output '  - 标题不超过 50 字符'
Write-Output '  - 必须包含非空的 Context: / Tried: / Verify: 三行'
Write-Output ''
Write-Output '规范见 prompts/COMMIT_MSG.md'
Write-Output '紧急绕过：git commit --no-verify（请在群里说一声）'
