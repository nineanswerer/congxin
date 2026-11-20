# 一键本地启动 —— 从心 · congxin
#
# 为什么有这个脚本（11-20）：
#   常驻服务如果挂在后台任务里，**每小时会被回收一次**，表现是「演示到一半服务没了」，
#   而且没有任何报错提示，很难当场判断是服务挂了还是别的问题。
#   这条脚本是给**人在自己的终端里前台跑**用的 —— Ctrl+C 才停，不受任何超时限制。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1           # 启动（前台常驻）
#   powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1 -Check    # 只体检，不启动
#   powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1 -Port 18789
#
# 密钥来源（与 server/src/config.js 同一套优先级，脚本只负责体检与提示，不碰密钥内容）：
#   1. 环境变量 ZHIHU_ACCESS_SECRET
#   2. 环境变量 ZHIHU_ACCESS_SECRET_FILE 指向的文件
#   3. 仓库根的 secrets\access_secret（等价于约定路径，.gitignore 已覆盖）
#   4. 本机知乎 CLI 的落点 $HOME\.zhihu-cli\access_secret（找到就交给后端进程）
#   都读不到 → **服务照常起**，接口回真实错误提示（不返回假数据，官方第 7 条）

param(
    [int]$Port = 18787,
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 输出统一 UTF-8：PowerShell 5.1 重定向时默认用 OEM 编码，中文会变成乱码
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

Write-Host ''
Write-Host '  从心 · 本地启动' -ForegroundColor Cyan
Write-Host "  仓库：$root"
Write-Host ''

# ---------- 1. Node ----------
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host '  ✗ 没找到 node。先装 Node 20+（https://nodejs.org）。' -ForegroundColor Red
    exit 1
}
$nodeVer = ((& node -v) -replace '^v', '').Trim()
$major = 0
if (-not [int]::TryParse($nodeVer.Split('.')[0], [ref]$major) -or $major -lt 20) {
    Write-Host "  ✗ Node 版本过低（$nodeVer），要 20+。" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Node $nodeVer"

# ---------- 2. 依赖 ----------
if (-not (Test-Path 'node_modules\express')) {
    Write-Host '  · 第一次跑，正在装依赖（只有 express 一个包）…' -ForegroundColor Yellow
    & npm install --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Host '  ✗ npm install 失败（网络问题？可试 --registry=https://registry.npmmirror.com）' -ForegroundColor Red
        exit 1
    }
}
Write-Host '  ✓ 依赖已就绪'

# ---------- 3. Access Secret（只查在不在，不打印内容）----------
$secretSource = ''
$secretValue = ''

if ($env:ZHIHU_ACCESS_SECRET) {
    $secretSource = '环境变量 ZHIHU_ACCESS_SECRET'
    $secretValue = $env:ZHIHU_ACCESS_SECRET
}
elseif ($env:ZHIHU_ACCESS_SECRET_FILE -and (Test-Path $env:ZHIHU_ACCESS_SECRET_FILE)) {
    $secretSource = "ZHIHU_ACCESS_SECRET_FILE → $($env:ZHIHU_ACCESS_SECRET_FILE)"
}
elseif (Test-Path 'secrets\access_secret') {
    $raw = [System.IO.File]::ReadAllText((Resolve-Path 'secrets\access_secret')).Trim()
    if ($raw) {
        $secretSource = 'secrets\access_secret'
        $secretValue = $raw
    }
}
else {
    # 本机知乎 CLI 的默认落点（官方 CLI 把密钥放这儿）。
    # 找到了就交给后端进程，**只进进程内存，不写进任何文件、不打印**。
    $cliSecret = Join-Path $HOME '.zhihu-cli\access_secret'
    if (Test-Path $cliSecret) {
        $raw = [System.IO.File]::ReadAllText($cliSecret).Trim()
        if ($raw) {
            $secretSource = "$HOME\.zhihu-cli\access_secret（本机知乎 CLI 落点）"
            $secretValue = $raw
        }
    }
}

if ($secretSource) {
    Write-Host "  ✓ Access Secret 已就位（$secretSource）" -ForegroundColor Green
    if ($secretValue) {
        $env:ZHIHU_ACCESS_SECRET = $secretValue
    }
}
else {
    Write-Host '  ⚠ 没读到 Access Secret —— 服务照常起，接口会回真实错误提示。' -ForegroundColor Yellow
    Write-Host '    要完整体验：https://developer.zhihu.com/profile → 登录 → 申请新 Access Secret' -ForegroundColor Yellow
    Write-Host '    拿到后存进 secrets\access_secret（已 gitignore，提交不上去）' -ForegroundColor Yellow
}

# ---------- 4. 端口 ----------
$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    Write-Host "  ✗ 端口 $Port 被占用（pid $($busy[0].OwningProcess)）。" -ForegroundColor Red
    Write-Host "    换一个：-Port 18789" -ForegroundColor DarkGray
    exit 1
}
Write-Host "  ✓ 端口 $Port 空闲"

if ($Check) {
    Write-Host ''
    Write-Host '  体检通过（-Check 模式，不启动服务）' -ForegroundColor Cyan
    Write-Host ''
    exit 0
}

# ---------- 5. 起 ----------
$env:PORT = "$Port"
Write-Host ''
Write-Host "  → 打开     http://localhost:$Port/web/" -ForegroundColor Green
Write-Host "  → 5 分钟演练  http://localhost:$Port/web/?demo=1" -ForegroundColor Green
Write-Host '  → Ctrl+C 停止' -ForegroundColor DarkGray
Write-Host ''

& node server/src/index.js
