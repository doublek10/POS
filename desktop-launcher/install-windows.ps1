<#
  Installs the POS Till launcher as a proper Windows shortcut:
    - Prompts for (or accepts) the POS URL and writes it into launch-pos.vbs
    - Creates a Desktop shortcut using the custom till icon (pos-icon.ico)
    - Optionally copies the same shortcut into the Startup folder, so
      the till PC opens straight into the POS when it boots — the
      normal setup for a dedicated till machine.

  Usage (from an ordinary PowerShell prompt, no admin rights needed):
      cd desktop-launcher
      .\install-windows.ps1 -PosUrl "https://pos.yourbusiness.com" -AutoStart

  Run without -AutoStart to only create the Desktop icon.
#>

param(
  [string]$PosUrl = "http://localhost:3000",
  [switch]$AutoStart
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VbsPath   = Join-Path $ScriptDir "launch-pos.vbs"
$IconPath  = Join-Path $ScriptDir "pos-icon.ico"

if (-not (Test-Path $VbsPath))  { throw "launch-pos.vbs not found next to this script." }
if (-not (Test-Path $IconPath)) { throw "pos-icon.ico not found next to this script." }

# Write the chosen URL into the launcher so double-clicking it directly
# also works, not just the shortcut.
(Get-Content $VbsPath) -replace 'POS_URL = ".*"', "POS_URL = ""$PosUrl""" | Set-Content $VbsPath

function New-PosShortcut($TargetFolder) {
  $shortcutPath = Join-Path $TargetFolder "POS Till.lnk"
  $wshShell = New-Object -ComObject WScript.Shell
  $shortcut = $wshShell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = "wscript.exe"
  $shortcut.Arguments  = "`"$VbsPath`""
  $shortcut.IconLocation = $IconPath
  $shortcut.WorkingDirectory = $ScriptDir
  $shortcut.Description = "Open the POS till ($PosUrl) in Microsoft Edge"
  $shortcut.Save()
  return $shortcutPath
}

$desktop = New-PosShortcut ([Environment]::GetFolderPath("Desktop"))
Write-Host "Created desktop shortcut: $desktop"

if ($AutoStart) {
  $startupFolder = [Environment]::GetFolderPath("Startup")
  $startup = New-PosShortcut $startupFolder
  Write-Host "Also added to Startup: $startup"
  Write-Host "The till will open the POS automatically the next time this PC logs in."
}

Write-Host "`nDone. Double-click the 'POS Till' icon on the desktop to launch."
