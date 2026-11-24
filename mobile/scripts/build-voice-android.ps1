param(
  [string]$JavaDirectory = $env:JAVA_HOME,
  [string]$AndroidSdkDirectory = $env:ANDROID_HOME
)
$ErrorActionPreference = 'Stop'
$mobileRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $JavaDirectory) { $JavaDirectory = 'C:\Program Files\Android\Android Studio\jbr' }
if (-not $AndroidSdkDirectory) { $AndroidSdkDirectory = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path -LiteralPath (Join-Path $JavaDirectory 'bin\java.exe'))) { throw 'Provide an installed supported JDK directory.' }
if (-not (Test-Path -LiteralPath (Join-Path $AndroidSdkDirectory 'platform-tools'))) { throw 'Provide the installed Android SDK directory.' }
$nativeRoot = Join-Path $mobileRoot 'android'
if (-not (Test-Path -LiteralPath (Join-Path $nativeRoot 'gradlew.bat'))) { throw 'Prepare the native voice Android project first.' }
[xml]$nativeManifest = Get-Content -Raw -LiteralPath (Join-Path $nativeRoot 'app\src\main\AndroidManifest.xml')
$androidNamespace = 'http://schemas.android.com/apk/res/android'
$toolsNamespace = 'http://schemas.android.com/tools'
$microphone = @($nativeManifest.manifest.'uses-permission' | Where-Object { $_.GetAttribute('name', $androidNamespace) -eq 'android.permission.RECORD_AUDIO' })
if ($microphone.Count -ne 1 -or $microphone[0].GetAttribute('node', $toolsNamespace) -eq 'remove') { throw 'The reviewed native voice microphone configuration has not been applied. Refresh the generated project before compilation.' }
$environmentNames = @('JAVA_HOME','ANDROID_HOME','ANDROID_SDK_ROOT','APP_ENV','ZIPP_NATIVE_VOICE_BUILD','CI','EXPO_OFFLINE')
$savedEnvironment = @{}
foreach ($name in $environmentNames) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
  $env:JAVA_HOME = $JavaDirectory
  $env:ANDROID_HOME = $AndroidSdkDirectory
  $env:ANDROID_SDK_ROOT = $AndroidSdkDirectory
  $env:APP_ENV = 'development'
  $env:ZIPP_NATIVE_VOICE_BUILD = 'true'
  $env:CI = '1'
  $env:EXPO_OFFLINE = '1'
  Push-Location $nativeRoot
  try {
    # Compile/package ARM64 only. No device installation, emulator, test runner,
    # lint, cloud build, SDK license acceptance or global environment mutation.
    & .\gradlew.bat :app:assembleDebug -x test -x lint --no-daemon --max-workers=1 '-Pkotlin.compiler.execution.strategy=in-process' -PreactNativeArchitectures=arm64-v8a '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=768m'
    if ($LASTEXITCODE -ne 0) { throw 'Native voice Android compilation failed. Inspect the Gradle output.' }
  } finally { Pop-Location }
} finally {
  foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
}
