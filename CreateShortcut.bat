@echo off
set "SCRIPT=%TEMP%\CreateShortcut-%RANDOM%.vbs"

echo Set oWS = WScript.CreateObject("WScript.Shell") >> "%SCRIPT%"
echo sLinkFile = "%USERPROFILE%\Desktop\啟動影片播放器.lnk" >> "%SCRIPT%"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%SCRIPT%"
echo oLink.TargetPath = "cmd.exe" >> "%SCRIPT%"
echo oLink.Arguments = "/c cd /d ""%~dp0"" && npm run dev" >> "%SCRIPT%"
echo oLink.WorkingDirectory = "%~dp0" >> "%SCRIPT%"
echo oLink.Description = "影片播放器" >> "%SCRIPT%"
echo oLink.IconLocation = "shell32.dll, 116" >> "%SCRIPT%"
echo oLink.WindowStyle = 7 >> "%SCRIPT%"
echo oLink.Save >> "%SCRIPT%"

cscript //nologo "%SCRIPT%"
del "%SCRIPT%"

echo 捷徑已成功建立在桌面上！
pause
