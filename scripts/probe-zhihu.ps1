# probe-zhihu.ps1 — 知乎开放能力实测脚本
#
# 用途：在开发前用最小调用量，核实每一项知乎开放能力在本账号上到底能不能用、
#       返回什么、消耗多少额度。结果写进 docs/status.md 的"阶段 0 实测记录"。
#
# 凭证来源（优先级从高到低）：
#   1. 环境变量 ZHIHU_ACCESS_SECRET
#   2. $env:USERPROFILE\.zhihu-cli\access_secret （本脚本自己维护的旁路存储，gitignore）
#   3. 交互式输入
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\probe-zhihu.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\probe-zhihu.ps1 -Only quota,question_recommendations
#
# 注意：每次业务调用都会消耗当日额度。脚本对每项能力默认只调用一次。

[CmdletBinding()]
param(
  [string[]]$Only = @(),
  [switch]$SkipHot   # 热榜额度只有 2 次/天，默认不测
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# powershell -File 传参时 "a,b,c" 会被当成一个字符串，这里拆开
if ($Only.Count -gt 0) {
  $Only = @($Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

$Base = 'https://developer.zhihu.com'
$SidecarPath = Join-Path $env:USERPROFILE '.zhihu-cli\access_secret'

function Get-Secret {
  if ($env:ZHIHU_ACCESS_SECRET) { return $env:ZHIHU_ACCESS_SECRET.Trim() }
  if (Test-Path -LiteralPath $SidecarPath) {
    return (Get-Content -LiteralPath $SidecarPath -Raw -Encoding UTF8).Trim()
  }
  $typed = Read-Host '请输入 Access Secret'
  if (-not $typed) { throw '未提供 Access Secret' }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $SidecarPath) | Out-Null
  [System.IO.File]::WriteAllText($SidecarPath, $typed.Trim(), (New-Object System.Text.UTF8Encoding($false)))
  return $typed.Trim()
}

$secret = Get-Secret

function Invoke-Zhihu {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$Method = 'GET',
    [string]$Query = '',
    [string]$Body = ''
  )
  $uri = "$Base$Path"
  if ($Query) { $uri = "$uri`?$Query" }
  $headers = @{
    'Authorization'        = "Bearer $secret"
    'X-Request-Timestamp' = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
    'Content-Type'        = 'application/json'
  }
  $params = @{
    Uri             = $uri
    Headers         = $headers
    Method          = $Method
    TimeoutSec      = 60
    UseBasicParsing = $true
  }
  if ($Body) { $params.Body = [System.Text.Encoding]::UTF8.GetBytes($Body) }
  try {
    $resp = Invoke-WebRequest @params
    $text = [System.Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray())
    return @{ ok = $true; status = $resp.StatusCode; body = $text }
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $text = [System.Text.Encoding]::UTF8.GetString($resp.GetResponseStream().ToArray())
      return @{ ok = $false; status = [int]$resp.StatusCode; body = $text }
    }
    return @{ ok = $false; status = 0; body = $_.Exception.Message }
  }
}

function Show-Result {
  param([string]$Name, [hashtable]$Result, [int]$MaxChars = 1200)
  Write-Output ''
  Write-Output ('===== ' + $Name + ' =====')
  Write-Output ('HTTP ' + $Result.status + '  ok=' + $Result.ok)
  $text = [string]$Result.body
  if ($text.Length -gt $MaxChars) { $text = $text.Substring(0, $MaxChars) + ' …[截断]' }
  Write-Output $text
}

$results = [ordered]@{}
$plan = [ordered]@{
  quota               = { Invoke-Zhihu -Path '/api/v1/quota' }
  zhihu_search        = { Invoke-Zhihu -Path '/api/v1/content/zhihu_search' -Query ('Query=' + [uri]::EscapeDataString('如何学习机器学习') + '&Count=3') }
  global_search       = { Invoke-Zhihu -Path '/api/v1/content/global_search' -Query ('Query=' + [uri]::EscapeDataString('RAG 检索增强生成') + '&Count=3') }
  question_recommendations = { Invoke-Zhihu -Path '/api/v1/user/question_recommendations' -Query ('Query=' + [uri]::EscapeDataString('RAG 与微调如何选择') + '&Count=5') }
  question_answers         = { Invoke-Zhihu -Path '/api/v1/content/question_answers' -Query ('QuestionUrl=' + [uri]::EscapeDataString('https://www.zhihu.com/question/641713254') + '&Offset=0&Limit=3') }
  hot_list            = { Invoke-Zhihu -Path '/api/v1/content/hot_list' -Query 'Limit=5' }
}

foreach ($key in $plan.Keys) {
  if ($Only.Count -gt 0 -and ($Only -notcontains $key)) { continue }
  if ($key -eq 'hot_list' -and $SkipHot) {
    Write-Output ''
    Write-Output '===== hot_list ====='
    Write-Output '已跳过（该能力当日额度仅 2 次，留给演示前再测）'
    continue
  }
  $results[$key] = & $plan[$key]
  Show-Result -Name $key -Result $results[$key]
}

Write-Output ''
Write-Output '===== 汇总 ====='
foreach ($key in $results.Keys) {
  Write-Output ('{0,-26} HTTP {1}' -f $key, $results[$key].status)
}
