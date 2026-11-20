param(
  [string]$BuildDirectory = 'D:\Projects\FormwardHarmony',
  [ValidateSet('assembleHap','assembleApp','tasks')][string]$Task = 'assembleHap',
  [ValidateSet('debug','release')][string]$BuildMode = 'debug',
  [string]$Repository = '',
  [switch]$SyncOnly
)
$ErrorActionPreference = 'Stop'
if (-not $Repository) { $Repository = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path }
$source = Join-Path $Repository 'apps\harmonyos'
$destination = [IO.Path]::GetFullPath($BuildDirectory)
if ($destination.TrimEnd('\') -eq [IO.Path]::GetPathRoot($destination)) { throw '拒绝使用磁盘根目录作为构建目录' }
if ($destination.StartsWith($Repository, [StringComparison]::OrdinalIgnoreCase)) { throw 'Windows 构建目录应与 WSL 源码分开' }
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$studio = 'D:\DevEco Studio'
$node = Join-Path $studio 'tools\node\node.exe'
$json5 = Join-Path $studio 'tools\hvigor\hvigor-ohos-plugin\node_modules\json5'
$prepare = Join-Path $Repository 'scripts\harmonyos\prepare-workspace.mjs'
$extensions = @('.ets','.ts','.json','.json5','.svg','.png','.jpg','.html','.css','.txt')
# 仅清理首版基础模板中已明确废弃的源码，不枚举或删除 IDE／签名／用户文件。
$obsolete = @('entry/src/main/ets/entrybackupability/EntryBackupAbility.ets','entry/src/main/resources/base/profile/backup_config.json','entry/src/main/resources/base/element/float.json','entry/src/main/resources/base/media/foreground.svg','AppScope/resources/base/media/foreground.svg','entry/src/main/resources/rawfile/icons/formward-mark.svg')
foreach ($relative in $obsolete) {
  $target = [IO.Path]::GetFullPath((Join-Path $destination $relative))
  if (-not $target.StartsWith($destination.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw '清理目标越出构建目录' }
  if (-not (Test-Path -LiteralPath (Join-Path $source $relative)) -and (Test-Path -LiteralPath $target -PathType Leaf)) { Remove-Item -LiteralPath $target }
}
foreach ($file in Get-ChildItem -LiteralPath $source -File -Recurse) {
  $relative = [IO.Path]::GetRelativePath($source, $file.FullName)
  if ($relative -match '(^|[\\/])(.hvigor|.idea|oh_modules|build)([\\/]|$)') { continue }
  if ($file.Name -in @('agconnect-services.json','build-profile.local.json5','local.properties')) { continue }
  if ($relative -eq 'build-profile.json5') { continue }
  if ($file.Extension -notin $extensions) { continue }
  $target = Join-Path $destination $relative
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
  Copy-Item -LiteralPath $file.FullName -Destination $target -Force
}
& $node $prepare $source $destination $json5 $BuildMode
if ($LASTEXITCODE -ne 0) { throw '工作区配置未能同步，请检查本机构建目录。' }
if ($SyncOnly) { Write-Output '鸿蒙源码同步完成，签名配置和 IDE 设置保持。'; return }
$env:DEVECO_SDK_HOME = Join-Path $studio 'sdk'
$env:JAVA_HOME = Join-Path $studio 'jbr'
$env:NODE_HOME = Join-Path $studio 'tools\node'
$env:Path = $env:NODE_HOME + ';' + $env:JAVA_HOME + '\bin;' + (Join-Path $studio 'tools\ohpm\bin') + ';' + $env:Path
Push-Location -LiteralPath $destination
try {
  $mode = if ($Task -eq 'assembleHap') { 'module' } else { 'project' }
  $arguments = @('--mode',$mode,'-p','product=default','-p',"buildMode=$BuildMode")
  if ($mode -eq 'module') { $arguments += @('-p','module=entry@default') }
  & $node (Join-Path $studio 'tools\hvigor\bin\hvigorw.js') @arguments $Task --no-daemon
  if ($LASTEXITCODE -ne 0) { throw '鸿蒙构建未通过，详见构建输出。' }
} finally { Pop-Location }
