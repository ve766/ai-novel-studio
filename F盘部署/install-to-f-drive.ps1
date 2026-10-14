$ErrorActionPreference = 'Stop'
$folderName = [string]::Concat([char]0x0061, [char]0x0069, [char]0x5C0F, [char]0x8BF4)
$driveRoot = 'F:\'
if (-not (Test-Path -LiteralPath $driveRoot)) {
  Write-Host 'F: drive was not found. No changes were made to other drives.'
  exit 1
}
$target = Join-Path -Path $driveRoot -ChildPath $folderName
New-Item -ItemType Directory -Path $target -Force | Out-Null
$setup = Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.exe' -File | Select-Object -First 1
if ($null -eq $setup) {
  Write-Host 'Installer executable was not found. Extract every file from the deployment ZIP.'
  exit 1
}
Start-Process -FilePath $setup.FullName
