<#
.SYNOPSIS
    契约自检：检查仓库是否违反 contracts/contract.json 声明的不可变事实。

.DESCRIPTION
    这是"双人 + 双 AI 平台"协作的第一道闸门。换平台、换人、换机器之后，
    跑一遍就知道仓库还是不是自洽的。

    检查项：
      1. contract.json 存在且是合法 JSON
      2. 必备文件都在（上下文四层骨架 + 四份提示词 + 两个 hook）
      3. AGENTS.md 不超过行数上限（别写太长，否则每次会话都在烧 token）
      4. 疑似密钥扫描（FAIL 级：赋值形式 / 常见前缀 / 整行裸密钥）
      5. .gitignore 覆盖 .env* / access_secret / .ctx
      6. contract.json 里的关键日期在 docs/status.md 里能对上
      7. commit-msg hook 是否已安装（WARN）
      8. 是否已有交接记录（WARN）
      9. 各 AI 平台指针文件是否都指向 AGENTS.md 与 BOOTSTRAP.md（漏一个 = 那个平台收不到协议）
     10. post-checkout hook 是否带开工清单
     11. API 契约 api.json 是否存在、可解析、14 个核心接口齐全、出处三件套与 user_hint 必填、登录两模式齐全、卡片沿用 SourceCard
     12. 分类体系 taxonomy.json 是否存在、可解析、类目字段齐全、unknown 兜底在位
     13. 语气契约 tone.json 是否存在、可解析、**默认语气是不是 gentle**、两个语气台词是否齐全

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
    '.githooks\commit-msg',
    '.githooks\post-checkout'
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
    # 从 process.env 读取的写法（accessSecret: process.env.ZHIHU_ACCESS_SECRET）是安全的：
    # 仓库里只存变量名，不存密钥。这类必须排除，否则 server/src/config.js 会被误报成泄露。
    # ⚠️ 排除「右值是**函数调用**」的情况：`const oauthToken = oauthTokenForRequest(...)`
    #    这种右值是调用结果，不是硬编码在仓库里的密钥，不该被判成泄露。
    #    判据：右值那串标识符后面紧跟 `(` → 是调用。
    #    真·硬编码密钥后面不会跟 `(`，所以这条排除**不会放宽对真密钥的拦截**。
    @{ Name = '赋值形式(secret/token/key/password)'; Regex = '(?i)(secret|token|api[_-]?key|password|passwd)\s*[:=]\s*["'']?(?!process\.env\.)(?![A-Za-z0-9_\-\.]*\()[A-Za-z0-9_\-\.]{16,}' },
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
if ($giText -notmatch '(?m)^\.ctx/') { $giProblems += '.ctx/（待提交理由的临时文件，不该入库）' }
if ($giProblems.Count -eq 0) {
    Add-Result 'PASS' '.gitignore 覆盖凭证' '.env / .env.* / access_secret / .ctx 均已排除'
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

# ---------------------------------------------------------------- 9. 自动触发点
# 双 AI 协作要"不用人记得"，前提是每个 AI 平台一开仓库就能自己读到工作协议。
# 注意：Gemini 的 context.fileName 只能指向**一个**文件，所以指针链可能是两跳
# （指针文件 → AGENTS.md → prompts/BOOTSTRAP.md）。这里验的是**链能不能走通**，
# 不是"指针文件里有没有 BOOTSTRAP 这个词"。
$agentsText = if (Test-Path -LiteralPath (Join-Path $Root 'AGENTS.md')) { [System.IO.File]::ReadAllText((Join-Path $Root 'AGENTS.md')) } else { '' }
$agentsHasBoot = ($agentsText -match 'BOOTSTRAP')

$pointers = @(
    'CLAUDE.md',
    '.cursor\rules\00-project.mdc',
    '.gemini\settings.json',
    '.aider.conf.yml',
    '.github\copilot-instructions.md'
)
$pointerProblems = @()
foreach ($p in $pointers) {
    $pp = Join-Path $Root $p
    if (-not (Test-Path -LiteralPath $pp)) { $pointerProblems += "$p 缺失"; continue }
    try { $pt = [System.IO.File]::ReadAllText($pp) } catch { $pointerProblems += "$p 读取失败"; continue }
    if ($pt -notmatch 'AGENTS\.md') { $pointerProblems += "$p 未指向 AGENTS.md"; continue }
    # 直接指 BOOTSTRAP，或经 AGENTS.md 两跳到 BOOTSTRAP，都算通
    if ($pt -match 'BOOTSTRAP') { continue }
    if ($agentsHasBoot) { continue }
    $pointerProblems += "$p 到 BOOTSTRAP 的指针链断了"
}
if ($pointerProblems.Count -eq 0) {
    Add-Result 'PASS' '各平台指针文件' "$($pointers.Count) 个平台均能读到 AGENTS.md 与开工协议"
} else {
    Add-Result 'FAIL' '各平台指针文件' ($pointerProblems -join ' | ')
}

# ---------------------------------------------------------------- 10. post-checkout hook 可执行
$poHook = Join-Path $Root '.githooks\post-checkout'
if (-not (Test-Path -LiteralPath $poHook)) {
    Add-Result 'FAIL' 'post-checkout hook' '文件缺失'
} else {
    $poText = [System.IO.File]::ReadAllText($poHook)
    if ($poText -notmatch 'BOOTSTRAP|contract\.json') {
        Add-Result 'FAIL' 'post-checkout hook' '内容里没有开工清单'
    } else {
        Add-Result 'PASS' 'post-checkout hook' 'pull / clone 后会自动打印开工清单'
    }
}

# ---------------------------------------------------------------- 11. API 契约完整性
# 契约不是文档，是约束。接口形状被改坏时，自检必须拦下来。
$apiPath = Join-Path $Root 'contracts\api.json'
if (-not (Test-Path -LiteralPath $apiPath)) {
    Add-Result 'FAIL' 'API 契约 api.json' '文件缺失'
} else {
    try {
        $apiDoc = ([System.IO.File]::ReadAllText($apiPath)) | ConvertFrom-Json
        $requiredPaths = @(
            '/api/behavior/favorites',
            '/api/behavior/followees',
            '/api/behavior/contents',
            '/api/behavior/tension',
            '/api/situation/question',
            '/api/terrain',
            '/api/terrain/answer',
            '/api/quota',
            '/api/tone',
            '/api/auth/profile',
            '/api/auth/login',
            '/api/auth/callback',
            '/api/auth/logout',
            '/api/cards'
        )
        $missingPaths = @()
        foreach ($rp in $requiredPaths) {
            if (-not $apiDoc.paths.PSObject.Properties[$rp]) { $missingPaths += $rp }
        }
        # 三条硬规则的机器可判定部分
        $sourceRequired = @($apiDoc.components.schemas.SourceRef.required) -contains 'question_url'
        $hintRequired = @($apiDoc.components.schemas.ErrorResponse.properties.error.required) -contains 'user_hint'
        $emptyFlag = @($apiDoc.components.schemas.FavoritesSignal.required) -contains 'empty'
        # 认知闭环底线：断层必须带 signal_count 与 insufficient（信号不足时不能硬撑断层）
        $tensionRequired = @($apiDoc.components.schemas.TensionData.required)
        $tensionFlag = ($tensionRequired -contains 'signal_count') -and ($tensionRequired -contains 'insufficient')
        # 语气默认值也是拍板过的（用户 2026-11-18），契约层必须写死 gentle
        $toneDefault = $apiDoc.components.schemas.ToneId.default
        # 登录（OAuth）：两种模式必须写死，且「没登录」与「登录了」前端要能分开
        $authRequired = @($apiDoc.components.schemas.AuthProfileData.required)
        $authModeOk = ($authRequired -contains 'mode') -and ($authRequired -contains 'fullname') -and ($authRequired -contains 'empty')
        $authModes = @($apiDoc.components.schemas.AuthMode.enum)
        $authEnumOk = ($authModes -contains 'oauth') -and ($authModes -contains 'developer_account')
        # 出处三件套：问题标题 + 问题 URL + **原回答 URL** 必须齐（官方检查第 6/7 条查的就是没有出处的卡片）
        $sourceTriple = (@($apiDoc.components.schemas.SourceRef.required) -contains 'answer_url') -and
                         ($apiDoc.components.schemas.SourceRef.properties.answer_url.type -eq 'string')
        # 卡片与情境题必须共用 SourceCard，不许新造一套
        $cardKinds = @($apiDoc.components.schemas.SourceCard.properties.kind.enum)
        $cardKindOk = ($cardKinds -contains 'knowledge_card') -and ($cardKinds -contains 'situation_question')
        # 卡片数据：cards / empty / empty_notice 必填（空数据≠失败）
        $cardsRequired = @($apiDoc.components.schemas.CardsData.required)
        $cardsOk = ($cardsRequired -contains 'cards') -and ($cardsRequired -contains 'empty') -and ($cardsRequired -contains 'empty_notice')

        $why = @()
        if ($missingPaths.Count -gt 0) { $why += ('缺接口 ' + ($missingPaths -join ', ')) }
        if (-not $sourceRequired) { $why += 'SourceRef 未把 question_url 设为必填' }
        if (-not $hintRequired) { $why += '错误信封未把 user_hint 设为必填' }
        if (-not $emptyFlag) { $why += '信号结构未把 empty 设为必填（空数据与失败无法区分）' }
        if (-not $tensionFlag) { $why += 'TensionData 未把 signal_count / insufficient 设为必填（断层会失去诚实底线）' }
        if ($toneDefault -ne 'gentle') { $why += "ToneId.default 不是 gentle（实际 '$toneDefault'）——用户拍板过默认是温和陪伴" }
        if (-not $authModeOk) { $why += 'AuthProfileData 未把 mode / fullname / empty 设为必填（前端分不清「没登录」与「登录了」）' }
        if (-not $authEnumOk) { $why += 'AuthMode 枚举缺 oauth / developer_account 两种模式' }
        if (-not $sourceTriple) { $why += 'SourceRef 未把 answer_url（原回答 URL）设为必填非空——卡片会缺出处' }
        if (-not $cardKindOk) { $why += 'SourceCard.kind 枚举缺 knowledge_card / situation_question——卡片不许新造一套' }
        if (-not $cardsOk) { $why += 'CardsData 未把 cards / empty / empty_notice 设为必填（空数据与失败分不开）' }

        if ($why.Count -eq 0) {
            Add-Result 'PASS' 'API 契约 api.json' "$($requiredPaths.Count) 个核心接口齐全；出处三件套必填 / user_hint 必填 / empty 必填 / 断层诚实底线必填 / 语气默认 gentle / 登录两模式齐全 / 卡片沿用 SourceCard"
        } else {
            Add-Result 'FAIL' 'API 契约 api.json' ($why -join ' | ')
        }
    } catch {
        Add-Result 'FAIL' 'API 契约 api.json' ('解析失败：' + $_.Exception.Message)
    }
}

# ---------------------------------------------------------------- 12. 分类体系契约完整性
# 分类口径是跨两个人的接口：后端算、前端显示。口径改坏，前端就读不懂。
$taxPath = Join-Path $Root 'contracts\taxonomy.json'
if (-not (Test-Path -LiteralPath $taxPath)) {
    Add-Result 'FAIL' '分类体系 taxonomy.json' '文件缺失'
} else {
    try {
        $taxDoc = ([System.IO.File]::ReadAllText($taxPath)) | ConvertFrom-Json
        $topicCats = @($taxDoc.topic_categories.categories)
        $argStructs = @($taxDoc.argument_structures.structures)
        $why = @()
        if ($topicCats.Count -lt 5) { $why += "主题分类不足 5 类（实际 $($topicCats.Count)）" }
        if ($argStructs.Count -lt 3) { $why += "论证结构不足 3 类（实际 $($argStructs.Count)）" }
        # 每个类目必须带 id / name / description / keywords：前端要显示 name、要说清 description
        $badTopic = @($topicCats | Where-Object { -not $_.id -or -not $_.name -or -not $_.description -or -not $_.keywords })
        if ($badTopic.Count -gt 0) { $why += "有 $($badTopic.Count) 个主题分类缺 id/name/description/keywords" }
        # unknown 兜底必须存在：关键词命中 0 条时不许硬塞进某一类
        if (-not $taxDoc.matching.unknown.id) { $why += '缺少 unknown 兜底类目' }
        if ([int]$taxDoc.matching.threshold -lt 1) { $why += '命中阈值 < 1，无关内容会被硬分进类' }
        if ($why.Count -eq 0) {
            Add-Result 'PASS' '分类体系 taxonomy.json' "$($topicCats.Count) 个主题类 / $($argStructs.Count) 个论证结构；unknown 兜底与阈值正常"
        } else {
            Add-Result 'FAIL' '分类体系 taxonomy.json' ($why -join ' | ')
        }
    } catch {
        Add-Result 'FAIL' '分类体系 taxonomy.json' ('解析失败：' + $_.Exception.Message)
    }
}

# ---------------------------------------------------------------- 13. 语气契约完整性
# 语气目录是跨两个人的接口：后端给文案，前端渲染。
# **默认值是用户拍板过的**——有人手滑把默认改成活泼的，自检必须拦下来。
$tonePath = Join-Path $Root 'contracts\tone.json'
if (-not (Test-Path -LiteralPath $tonePath)) {
    Add-Result 'FAIL' '语气契约 tone.json' '文件缺失'
} else {
    try {
        $toneDoc = ([System.IO.File]::ReadAllText($tonePath)) | ConvertFrom-Json
        $toneOptions = @($toneDoc.options)
        $toneKeys = @($toneDoc.line_keys)
        $why = @()
        if ($toneDoc.default -ne 'gentle') {
            $why += "默认语气不是 gentle（实际 '$($toneDoc.default)'）——用户 2026-11-18 拍板：默认就是温和陪伴，别改成活泼的"
        }
        if ($toneOptions.Count -lt 2) { $why += "语气不足 2 个（实际 $($toneOptions.Count)）" }
        if ($toneKeys.Count -lt 10) { $why += "台词 key 不足 10 个（实际 $($toneKeys.Count)）" }
        # 每个语气都必须给全部台词：前端按 key 取，缺 key 会静默变空
        foreach ($opt in $toneOptions) {
            $lines = $toneDoc.lines.($opt.id)
            if (-not $lines) { $why += "语气 $($opt.id) 没有台词"; continue }
            $missing = @($toneKeys | Where-Object { -not $lines.PSObject.Properties[$_] })
            if ($missing.Count -gt 0) { $why += "语气 $($opt.id) 缺 $($missing -join '、')" }
        }
        # 台词里不许出现数字：数字归数据陈述（断层 label / confidence_note），两个真相源必漂
        foreach ($opt in $toneOptions) {
            $lines = $toneDoc.lines.($opt.id)
            if (-not $lines) { continue }
            foreach ($p in $lines.PSObject.Properties) {
                if ([string]$p.Value -match '\d') { $why += "语气 $($opt.id) 的台词 '$($p.Name)' 带了数字" }
            }
        }
        if ($why.Count -eq 0) {
            Add-Result 'PASS' '语气契约 tone.json' "$($toneOptions.Count) 个语气 / $($toneKeys.Count) 句台词；默认 gentle"
        } else {
            Add-Result 'FAIL' '语气契约 tone.json' ($why -join ' | ')
        }
    } catch {
        Add-Result 'FAIL' '语气契约 tone.json' ('解析失败：' + $_.Exception.Message)
    }
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
