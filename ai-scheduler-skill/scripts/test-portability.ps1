# AI Scheduler Skill - Windows可移植性测试脚本
# 用法: .\scripts\test-portability.ps1 [-Quick|-Full]

param(
    [switch]$Quick = $true,
    [switch]$Full = $false
)

if ($Full) { $Quick = $false }

# 配置
$RepoUrl = "https://github.com/V23333152/ai-scheduler-skill.git"
$TestDir = "$env:TEMP\ai-scheduler-test-$PID"
$ReportFile = "$TestDir\report.md"
$ResultsJson = "$TestDir\results.json"

# 统计
$TestsTotal = 0
$TestsPassed = 0
$TestsFailed = 0
$TestsSkipped = 0

# 颜色函数
function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Pass($msg) {
    Write-Host "[PASS] $msg" -ForegroundColor Green
    $script:TestsPassed++
    $script:TestsTotal++
}
function Write-Fail($msg) {
    Write-Host "[FAIL] $msg" -ForegroundColor Red
    $script:TestsFailed++
    $script:TestsTotal++
}
function Write-Skip($msg) {
    Write-Host "[SKIP] $msg" -ForegroundColor Yellow
    $script:TestsSkipped++
    $script:TestsTotal++
}

# 清理
function Cleanup {
    if (Test-Path $TestDir) {
        Write-Info "清理测试目录..."
        Remove-Item -Recurse -Force $TestDir -ErrorAction SilentlyContinue
    }
}

trap { Cleanup }

# 测试1: 仓库克隆
function Test-Clone {
    Write-Info "测试1: 从GitHub克隆仓库..."
    try {
        git clone --depth 1 $RepoUrl "$TestDir\repo" 2>&1 | Out-Null
        Write-Pass "仓库克隆成功"
        return $true
    } catch {
        Write-Fail "仓库克隆失败: $_"
        return $false
    }
}

# 测试2: 文件完整性
function Test-FileIntegrity {
    Write-Info "测试2: 检查文件完整性..."
    $requiredFiles = @("README.md", "pyproject.toml", "Dockerfile", "docker-compose.yml")
    $missing = @()

    foreach ($file in $requiredFiles) {
        if (-not (Test-Path "$TestDir\repo\$file")) {
            $missing += $file
        }
    }

    if ($missing.Count -eq 0) {
        Write-Pass "所有必需文件存在"
        return $true
    } else {
        Write-Fail "缺少文件: $($missing -join ', ')"
        return $false
    }
}

# 测试3: Python环境
function Test-PythonEnv {
    Write-Info "测试3: Python环境检查..."
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
        $python = Get-Command python3 -ErrorAction SilentlyContinue
    }

    if (-not $python) {
        Write-Fail "未找到Python"
        return $false
    }

    $version = & $python.Source --version 2>&1
    Write-Info "Python版本: $version"

    if ($version -match "3\.(9|10|11)") {
        Write-Pass "Python版本兼容"
        return $true
    } else {
        Write-Fail "Python版本可能不兼容: $version"
        return $false
    }
}

# 测试4: Docker环境
function Test-Docker {
    Write-Info "测试4: Docker环境检查..."
    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $docker) {
        Write-Skip "Docker未安装"
        return $false
    }

    $version = docker --version
    Write-Info "Docker版本: $version"

    try {
        docker info 2>&1 | Out-Null
        Write-Pass "Docker可用"
        return $true
    } catch {
        Write-Fail "Docker守护进程未运行"
        return $false
    }
}

# 测试5: Python安装
function Test-PythonInstall {
    Write-Info "测试5: Python包安装..."

    $venvPath = "$TestDir\venv"
    & python -m venv $venvPath 2>&1 | Out-Null

    $activateScript = "$venvPath\Scripts\Activate.ps1"
    . $activateScript

    $installStart = Get-Date
    try {
        pip install -e "." 2>&1 | Out-Null
        $installEnd = Get-Date
        $installTime = [math]::Round(($installEnd - $installStart).TotalSeconds)

        Write-Pass "Python安装成功 (${installTime}s)"
        return $true
    } catch {
        Write-Fail "Python安装失败: $_"
        return $false
    }
}

# 生成报告
function Generate-Report {
    Write-Info "生成测试报告..."

    $score = if ($TestsTotal -gt 0) { [math]::Round(($TestsPassed / ($TestsTotal - $TestsSkipped)) * 100) } else { 0 }
    $stars = [math]::Floor($score / 20)

    $report = @"
# AI Scheduler Skill - Windows可移植性测试报告

**测试时间**: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**测试平台**: Windows $([System.Environment]::OSVersion.Version)
**测试模式**: $(if($Quick){"Quick"}else{"Full"})

## 测试统计

| 指标 | 数量 |
|-----|------|
| 通过 | $TestsPassed |
| 失败 | $TestsFailed |
| 跳过 | $TestsSkipped |
| **总计** | $TestsTotal |

## 可移植性评分

综合得分: $score/100

评级: $("⭐" * $stars)

## 结论

$(if ($TestsFailed -eq 0) { "✅ 所有测试通过！项目具有良好的可移植性。" } else { "⚠️ 有 $TestsFailed 项测试失败。" })

---
*报告由 test-portability.ps1 自动生成*
"@

    $report | Out-File -FilePath $ReportFile -Encoding UTF8

    # JSON结果
    $results = @{
        test_timestamp = (Get-Date -Format "o")
        platform = "Windows"
        test_mode = if($Quick){"quick"}else{"full"}
        summary = @{
            total = $TestsTotal
            passed = $TestsPassed
            failed = $TestsFailed
            skipped = $TestsSkipped
            score = $score
        }
    } | ConvertTo-Json

    $results | Out-File -FilePath $ResultsJson -Encoding UTF8

    Write-Info "报告已生成:"
    Write-Host "  - Markdown: $ReportFile"
    Write-Host "  - JSON: $ResultsJson"
}

# 主函数
function Main {
    Write-Host "========================================" -ForegroundColor Blue
    Write-Host "AI Scheduler Skill - Windows可移植性测试" -ForegroundColor Blue
    Write-Host "========================================" -ForegroundColor Blue
    Write-Host "测试模式: $(if($Quick){"Quick"}else{"Full"})"
    Write-Host "测试目录: $TestDir"
    Write-Host ""

    New-Item -ItemType Directory -Path $TestDir -Force | Out-Null

    # 执行测试
    Test-Clone
    Test-FileIntegrity
    Test-PythonEnv
    Test-Docker

    if (-not $Quick) {
        Test-PythonInstall
    }

    # 生成报告
    Generate-Report

    # 输出汇总
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Blue
    Write-Host "          测试完成" -ForegroundColor Blue
    Write-Host "========================================" -ForegroundColor Blue
    Write-Host "通过: $TestsPassed" -ForegroundColor Green
    Write-Host "失败: $TestsFailed" -ForegroundColor Red
    Write-Host "跳过: $TestsSkipped" -ForegroundColor Yellow
    Write-Host "----------------------------------------"

    if (Test-Path $ReportFile) {
        Write-Host ""
        Get-Content $ReportFile
    }

    # 清理
    Cleanup

    # 返回退出码
    if ($TestsFailed -gt 0) {
        exit 1
    }
    exit 0
}

# 帮助
if ($args -contains "--help" -or $args -contains "-h") {
    Write-Host "AI Scheduler Skill - Windows可移植性测试脚本"
    Write-Host ""
    Write-Host "用法: .\scripts\test-portability.ps1 [选项]"
    Write-Host ""
    Write-Host "选项:"
    Write-Host "  -Quick    快速测试 (默认) - 只测试基础环境"
    Write-Host "  -Full     完整测试 - 包括构建和功能测试"
    Write-Host "  -Help     显示帮助"
    exit 0
}

# 执行
Main
