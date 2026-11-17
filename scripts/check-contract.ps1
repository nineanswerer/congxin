<#
.SYNOPSIS
    契约自检：检查仓库是否违反 contracts/contract.json 声明的不可变事实。

.DESCRIPTION
    这是"双人 + 双 AI 平台"协作的第一道闸门。换平台、换人、换机器之后，
    跑一遍就知道仓库还是不是自洽的。

    检查项：
      1. contract.json 存在且是合法 JSON
      2. 必备文件都在（上下文四层骨架 + 四份提示词 + hook）
      3. AGENTS.md 不超过行数上限（别写太长，否则每次会话都在烧 token）
      4. 疑似密钥扫描（FAIL 级：赋值形式 / 常见前缀 / 整行裸密钥）
      5. .gitignore 覆盖 .env* 与 access_secret
      6. contract.json 里的关键日期在 docs/status.md 里能对上
      7. commit-msg hook 是否已安装（WARN）
      8. 是否已有交接记录（WARN）

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/check-contract.ps1
    powershell -ExecutionPolicy Bypass -File scripts/check-contract.ps1 -Json
#>
[CmdletBinding()]
param(
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent $PSScriptRoot
$results = New-Object System.Collections.ArrayList

function Add-Result {
    param([string]$Level, [string]$Name, [string]$Detail = '')
    [void]$results.Add([pscustomobject]@{ Level = $Level; Name = $Name; Detail = $Detail })
}

function Get-RelPath {
    param([string]$Full)
    if ($Full.StartsWith($Root)) { return $Full.Substring($Root.Length).TrimStart('\', '/') }
    return $Full
}

# ---------------------------------------------------------------- 1. contract.json
$contractPath = Join-Path $Root 'contracts\contract.json'
$contract = $null
if (-not (Test-Path -LiteralPath $contractPath)) {
    Add-Result 'FAIL' 'contract.json 存在' "缺失：$contractPath"
} else {
    try {
        $raw = [System.IO.File]::ReadAllText($contractPath)
        $contract = $raw | ConvertFrom-Json
        Add-Result 'PASS' 'contract.json 可解析' "schema_version=$($contract.schema_version)"
    } catch {
        Add-Result 'FAIL' 'contract.json 可解析' $_.Exception.Message
    }
}

# ---------------------------------------------------------------- 2. 必备文件
$required = @(
    'AGENTS.md',
    'contracts\contract.json',
    'contracts\CONTRACTS.md',
    'docs\decisions.md',
    'docs\status.md',
    'docs\brief.md',
    'docs\adr\README.md',
    'docs\adr\TEMPLATE.md',
    'docs\handoffs\TEMPLATE.md',
    'prompts\BOOTSTRAP.md',
    'prompts\HANDOFF.md',
    'prompts\CROSS_REVIEW.md',
    'prompts\COMMIT_MSG.md',
    '.githooks\commit-msg'
)
$missing = @()
foreach ($r in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $Root $r))) { $missing += $r }
}
if ($missing.Count -eq 0) {
    Add-Result 'PASS' '必备文件齐全' "$($required.Count) 个"
} else {
    Add-Result 'FAIL' '必备文件齐全' ("缺 " + ($missing -join ', '))
}

# ---------------------------------------------------------------- 3. AGENTS.md 行数上限
$agentsPath = Join-Path $Root 'AGENTS.md'
$agentsLimit = 120
if ($contract -and $contract.governance -and $contract.governance.agents_md_max_lines) {
    $agentsLimit = [int]$contract.governance.agents_md_max_lines
}
if (-not (Test-Path -LiteralPath $agentsPath)) {
    Add-Result 'FAIL' 'AGENTS.md 行数上限' 'AGENTS.md 不存在'
} else {
    $lines = [System.IO.File]::ReadAllLines($agentsPath).Count
    if ($lines -gt $agentsLimit) {
        Add-Result 'FAIL' 'AGENTS.md 行数上限' "$lines 行 > 上限 $agentsLimit 行（超了会持续抬高每次会话的推理成本）"
    } else {
        Add-Result 'PASS' 'AGENTS.md 行数上限' "$lines / $agentsLimit 行"
    }
}

# ---------------------------------------------------------------- 4. 密钥扫描
$secretPatterns = @(
    @{ Name = '赋值形式(secret/token/key/password)'; Regex = '(?i)(secret|token|api[_-]?key|password|passwd)\s*[:=]\s*["'']?[A-Za-z0-9_\-\.]{16,}' },
    @{ Name = 'sk- 前缀';  Regex = 'sk-[A-Za-z0-9]{16,}' },
    @{ Name = 'ghp_ 前缀'; Regex = 'gh[pousr]_[A-Za-z0-9]{20,}' },
    @{ Name = 'github_pat_ 前缀'; Regex = 'github_pat_[A-Za-z0-9_]{20,}' },
    @{ Name = 'Bearer 令牌'; Regex = '(?i)authorization\s*:\s*bearer\s+[A-Za-z0-9._\-]{20,}' }
)
$bareHex = '^[0-9a-fA-F]{40}$'

$tracked = @()
try {
    # core.quotepath=false：让 git 直接输出 UTF-8 路径而不是 \344\271 这样的转义，
    # 否则中文文件名会让 Test-Path 报 "Illegal characters in path"
    $tracked = @(git -C $Root -c core.quotepath=false ls-files --cached --others --exclude-standard 2>$null)
} catch { }

$leaks = New-Object System.Collections.ArrayList
$softHits = 0
foreach ($rel in $tracked) {
    $full = Join-Path $Root $rel
    if (-not (Test-Path -LiteralPath $full)) { continue }
    if ([System.IO.Path]::GetExtension($full).ToLower() -in @('.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.zip', '.exe')) { continue }
    try {
        $content = [System.IO.File]::ReadAllText($full)
    } catch { continue }
    if ([string]::IsNullOrEmpty($content)) { continue }
    $allLines = $content -split "`r?`n"
    for ($i = 0; $i -lt $allLines.Count; $i++) {
        $line = $allLines[$i]
        foreach ($p in $secretPatterns) {
            if ($line -match $p.Regex) {
                [void]$leaks.Add((Get-RelPath $full) + ':' + ($i + 1) + ' [' + $p.Name + ']')
            }
        }
        if ($line.Trim() -match $bareHex) {
            [void]$leaks.Add((Get-RelPath $full) + ':' + ($i + 1) + ' [整行 40 位十六进制，可能是裸密钥]')
        } elseif ($line -match '(?<![0-9a-fA-F])[0-9a-fA-F]{40}(?![0-9a-fA-F])') {
            $softHits++
        }
    }
}
if ($leaks.Count -eq 0) {
    Add-Result 'PASS' '密钥扫描' "扫描 $($tracked.Count) 个文件，未发现疑似密钥" + $(if ($softHits -gt 0) { "（另有 $softHits 处 40 位十六进制，多为 git sha，未判定为泄露）" } else { '' })
} else {
    Add-Result 'FAIL' '密钥扫描' ("发现 " + $leaks.Count + " 处：" + (($leaks | Select-Object -Unique) -join ' | '))
}

# ---------------------------------------------------------------- 5. .gitignore 覆盖
$giPath = Join-Path $Root '.gitignore'
$giText = if (Test-Path -LiteralPath $giPath) { [System.IO.File]::ReadAllText($giPath) } else { '' }
$giProblems = @()
if ($giText -notmatch '(?m)^\.env\s*$' -and $giText -notmatch '(?m)^\.env\.\*') { $giProblems += '.env' }
if ($giText -notmatch '(?m)^\.env\.\*') { $giProblems += '.env.*' }
if ($giText -notmatch '(?m)^access_secret\s*$') { $giProblems += 'access_secret' }
if ($giProblems.Count -eq 0) {
    Add-Result 'PASS' '.gitignore 覆盖凭证' '.env / .env.* / access_secret 均已排除'
} else {
    Add-Result 'FAIL' '.gitignore 覆盖凭证' ("未排除：" + ($giProblems -join ', '))
}

# ---------------------------------------------------------------- 6. 关键日期一致性
if ($contract) {
    $statusPath = Join-Path $Root 'docs\status.md'
    if (-not (Test-Path -LiteralPath $statusPath)) {
        Add-Result 'FAIL' '关键日期一致性' 'docs/status.md 不存在'
    } else {
        $statusText = [System.IO.File]::ReadAllText($statusPath)
        $dates = @()
        foreach ($prop in $contract.timeline.PSObject.Properties) {
            if ($prop.Value -is [string] -and $prop.Value -match '(\d{4}-\d{2}-\d{2})') { $dates += $Matches[1] }
        }
        $dates = $dates | Select-Object -Unique
        $absent = @()
        foreach ($d in $dates) { if ($statusText -notmatch [regex]::Escape($d)) { $absent += $d } }
        if ($absent.Count -eq 0) {
            Add-Result 'PASS' '关键日期一致性' ("$($dates.Count) 个时间点在 status.md 中都能对上")
        } else {
            Add-Result 'FAIL' '关键日期一致性' ("status.md 里找不到：" + ($absent -join ', '))
        }
    }
}

# ---------------------------------------------------------------- 7. hook 安装状态
$hooksPath = (git -C $Root config --get core.hooksPath 2>$null)
if ($hooksPath -eq '.githooks') {
    Add-Result 'PASS' 'commit-msg hook 已安装' 'core.hooksPath = .githooks'
} else {
    Add-Result 'WARN' 'commit-msg hook 未安装' '运行：powershell -ExecutionPolicy Bypass -File scripts/install-hooks.ps1'
}

# ---------------------------------------------------------------- 8. 交接记录
$handoffDir = Join-Path $Root 'docs\handoffs'
$handoffCount = 0
if (Test-Path -LiteralPath $handoffDir) {
    $handoffCount = @(Get-ChildItem -LiteralPath $handoffDir -Filter '*.md' -File | Where-Object { $_.Name -ne 'TEMPLATE.md' }).Count
}
if ($handoffCount -gt 0) {
    Add-Result 'PASS' '交接记录' "$handoffCount 份"
} else {
    Add-Result 'WARN' '交接记录' '还没有交接记录。换 AI 平台前先让 AI 写一份（见 prompts/HANDOFF.md）'
}

# ---------------------------------------------------------------- 输出
$pass = @($results | Where-Object { $_.Level -eq 'PASS' }).Count
$warn = @($results | Where-Object { $_.Level -eq 'WARN' }).Count
$fail = @($results | Where-Object { $_.Level -eq 'FAIL' }).Count

if ($Json) {
    [pscustomobject]@{
        pass = $pass; warn = $warn; fail = $fail
        results = @($results | ForEach-Object { [pscustomobject]@{ level = $_.Level; name = $_.Name; detail = $_.Detail } })
    } | ConvertTo-Json -Depth 5
} else {
    Write-Output ''
    Write-Output '=== 契约自检 ==='
    foreach ($r in $results) {
        $tag = switch ($r.Level) { 'PASS' { 'PASS ' } 'WARN' { 'WARN ' } 'FAIL' { 'FAIL ' } }
        Write-Output ("[{0}] {1}{2}" -f $tag, $r.Name, $(if ($r.Detail) { " — " + $r.Detail } else { '' }))
    }
    Write-Output ''
    Write-Output ("汇总：PASS {0} / WARN {1} / FAIL {2}" -f $pass, $warn, $fail)
}

if ($fail -gt 0) { exit 1 }
exit 0
