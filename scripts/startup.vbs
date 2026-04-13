Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim logPath
logPath = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\cc-remote\startup.log"

' ログフォルダがなければ作成
Dim logDir
logDir = fso.GetParentFolderName(logPath)
If Not fso.FolderExists(logDir) Then fso.CreateFolder(logDir)

Sub WriteLog(msg)
    Dim f
    Set f = fso.OpenTextFile(logPath, 8, True)
    f.WriteLine Now & " " & msg
    f.Close
End Sub

WriteLog "=== cc-remote-v3 startup begin ==="

' OneDrive同期待ち: フォルダが存在するまで最大3分リトライ（attrib +Pで強制DL）
Dim projectDir
projectDir = WshShell.ExpandEnvironmentStrings("%USERPROFILE%") & "\OneDrive\Claude秘書\開発部\cc-remote-v3"

Dim waitCount
waitCount = 0
Do While Not fso.FolderExists(projectDir)
    waitCount = waitCount + 1
    If waitCount > 18 Then
        WriteLog "ERROR: project dir not found after 3 min: " & projectDir
        WScript.Quit 1
    End If
    ' OneDriveオンデマンドファイルをピン（ダウンロード強制）
    If waitCount = 1 Then
        WriteLog "requesting OneDrive pin..."
        WshShell.Run "cmd /c attrib +P """ & projectDir & """ /S /D", 0, False
    End If
    WriteLog "waiting for OneDrive sync... (" & waitCount & "/18)"
    WScript.Sleep 10000
Loop

WriteLog "project dir found (waited " & (waitCount * 10) & "s)"

' node_modules確認（OneDrive同期中の場合があるため追加待機）
Dim nmDir
nmDir = projectDir & "\node_modules"
Dim nmWait
nmWait = 0
Do While Not fso.FolderExists(nmDir)
    nmWait = nmWait + 1
    If nmWait > 6 Then
        WriteLog "ERROR: node_modules not found after 60s"
        WScript.Quit 1
    End If
    WriteLog "waiting for node_modules... (" & nmWait & "/6)"
    WScript.Sleep 10000
Loop

WriteLog "starting node..."
Dim exitCode
exitCode = WshShell.Run("cmd /c cd /d """ & projectDir & """ && node src/server/index.js >> """ & logDir & "\server.log"" 2>&1", 0, False)
WriteLog "launched (Run returned: " & exitCode & ")"
