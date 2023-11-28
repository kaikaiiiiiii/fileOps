<# : chooser.bat
chcp 65001

:: drop file to execute, or open a file chooser dialog window to execute.
:: code mostly comes from https://stackoverflow.com/a/15885133/1683264

@ECHO OFF
setlocal
if "%~1" == "" goto PASTE


:droploop
echo "work on %~1"
echo.
node uTfix.js "%~1"
shift
if not "%~1" == "" goto droploop
goto :EOF

:PASTE
echo.
echo * Ctrl+V 粘贴目录，
echo. 
echo * [1]/[Enter] 窗口选择目录
echo.
set /p url="URL: "
if "%url%" == "" goto SELECT
if "%url%" == "1" goto SELECT
echo.
node uTfix.js "%url%" 
goto :EOF

:SELECT
for /f "delims=" %%I in ('powershell -noprofile "iex (${%~f0} | out-string)"') do (
    echo 开始下载 %%~I
    node uTfix.js "%%~I"
)
goto :EOF

:: end Batch portion / begin PowerShell hybrid chimera #>

Add-Type -AssemblyName System.Windows.Forms
$f = new-object Windows.Forms.OpenFileDialog
$f.InitialDirectory = pwd
$f.Filter = "Text Files (*.txt)|*.txt|All Files (*.*)|*.*"
$f.ShowHelp = $true
$f.Multiselect = $true
[void]$f.ShowDialog()
if ($f.Multiselect) { $f.FileNames } else { $f.FileName }