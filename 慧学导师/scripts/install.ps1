<#
.SYNOPSIS
    一键将「慧学导师 (huixue-mentor)」技能安装到 Antigravity / Claude Code / Cursor / Codex。
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Target antigravity-global
    powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Target all -DryRun
#>
[CmdletBinding()]
param(
    [ValidateSet("antigravity-workspace", "antigravity-global", "claude", "cursor", "codex", "all")]
    [string]$Target = "antigravity-global",

    [string]$WorkspaceRoot = (Get-Location).Path,

    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$SkillRoot = Split-Path -Parent $PSScriptRoot
$SkillName = "huixue-mentor"

$Targets = @()
switch ($Target) {
    "antigravity-workspace" { $Targets += (Join-Path $WorkspaceRoot ".agents\skills\$SkillName") }
    "antigravity-global"    { $Targets += (Join-Path $HOME ".gemini\config\skills\$SkillName") }
    "claude"                { $Targets += (Join-Path $HOME ".claude\skills\$SkillName") }
    "cursor"                { $Targets += (Join-Path $HOME ".cursor\skills\$SkillName") }
    "codex"                 { $Targets += (Join-Path $HOME ".codex\skills\$SkillName") }
    "all" {
        $Targets += (Join-Path $HOME ".gemini\config\skills\$SkillName")
        $Targets += (Join-Path $HOME ".claude\skills\$SkillName")
        $Targets += (Join-Path $HOME ".cursor\skills\$SkillName")
        $Targets += (Join-Path $HOME ".codex\skills\$SkillName")
    }
}

$ItemsToCopy = @("SKILL.md", "README.md", "README_EN.md", "LICENSE", "CONTRIBUTING.md", "references", "scripts", "examples")

foreach ($dest in $Targets) {
    Write-Host "Target: $dest" -ForegroundColor Cyan
    if ($DryRun) {
        Write-Host "  [DryRun] Would mirror $SkillRoot -> $dest" -ForegroundColor Yellow
        continue
    }
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    foreach ($item in $ItemsToCopy) {
        $src = Join-Path $SkillRoot $item
        $dst = Join-Path $dest $item
        if (Test-Path $src) {
            if (Test-Path $dst) { Remove-Item -Path $dst -Recurse -Force }
            Copy-Item -Path $src -Destination $dst -Recurse -Force
        }
    }
    Write-Host "  Installed successfully -> $dest" -ForegroundColor Green
}
