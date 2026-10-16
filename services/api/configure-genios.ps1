# Only a local, hidden prompt. Never pass the credential as a command argument or print it.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$privateDir = Join-Path $projectRoot 'data/private'
$configPath = Join-Path $privateDir 'genios-config.json'
$secureKey = $null
$privateKeyText = $null
$keyPointer = [IntPtr]::Zero

try {
    try { $Host.UI.RawUI.WindowTitle = '校宠伴行：服务端密钥配置（仅本机）' } catch { }
    Write-Host '校宠伴行：服务端密钥配置（仅本机）' -ForegroundColor Cyan
    Write-Host '请先在南开平台选择「校宠伴行_服务端」。'
    Write-Host 'APPID：db8qfm54shhbpg924dpg；只开启 API 渠道，其他渠道保持关闭。'
    Write-Host '创建 API 密钥后复制，粘贴到下方隐藏输入处，按回车保存。'
    Write-Host '不要填写原生聊天版密钥；不要把密钥发到聊天或截图里。'
    Write-Host ''

    & git -C $projectRoot check-ignore --quiet 'data/private/genios-config.json'
    if ($LASTEXITCODE -ne 0) { throw '私有配置未被 Git 排除，已停止保存。' }

    $secureKey = Read-Host '粘贴服务端 API 密钥（输入不显示）' -AsSecureString
    $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    $privateKeyText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer).Trim()
    if ($privateKeyText -notmatch '^[A-Za-z0-9_./+=-]{20,500}$') {
        throw '密钥格式不符合已核实的格式，未写入配置；请检查是否复制完整。'
    }

    New-Item -ItemType Directory -Path $privateDir -Force | Out-Null
    if (Test-Path -LiteralPath $configPath) {
        $previous = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
        $nativeBackup = Join-Path $privateDir 'genios-native-config.json'
        if ($previous.app_id -eq 'db878d54shhas0an4th0' -and -not (Test-Path -LiteralPath $nativeBackup)) {
            Copy-Item -LiteralPath $configPath -Destination $nativeBackup
        }
    }
    $config = [ordered]@{
        api_key = $privateKeyText
        base_url = 'https://coze.nankai.edu.cn/api/proxy/api/v1/'
        app_id = 'db8qfm54shhbpg924dpg'
        structured_output_verified = $false
    }
    [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json) + [Environment]::NewLine,
        [Text.UTF8Encoding]::new($false))
    Write-Host ''
    Write-Host '已保存到本机私有配置，未上传，未显示密钥。' -ForegroundColor Green
    Write-Host '接下来请在平台确认 API 渠道发布并审批通过，然后回到聊天回复「配置好了」。'
    Write-Host '真实结构化验证通过前，业务服务仍保持未接通状态。'
} catch {
    # Do not print exception text: a parser or I/O error could include private data.
    Write-Host '配置没有保存成功。请核对服务端密钥、Git 排除规则和本机文件权限。' -ForegroundColor Red
} finally {
    if ($keyPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer) }
    if ($null -ne $secureKey) { $secureKey.Dispose() }
    $privateKeyText = $null
    $config = $null
}
[void](Read-Host '按回车关闭窗口')
