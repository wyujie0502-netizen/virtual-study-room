Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' 项目路径
projectPath = fso.GetParentFolderName(WScript.ScriptFullName)
serverPath = projectPath & "\server"

' Chrome 路径
chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
If Not fso.FileExists(chromePath) Then
    chromePath = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
End If

' 检查服务是否在运行
Set http = CreateObject("MSXML2.ServerXMLHTTP")
On Error Resume Next
http.Open "GET", "http://localhost:3001/api/health", False
http.Send
If Err.Number <> 0 Or http.Status <> 200 Then
    ' 需要启动服务（无窗口）
    WshShell.Run "cmd /c ""cd /d " & serverPath & " && node index.js""", 0, False
    ' 等待服务启动
    WScript.Sleep 3000
    For i = 1 To 15
        WScript.Sleep 1000
        On Error Resume Next
        http.Open "GET", "http://localhost:3001/api/health", False
        http.Send
        If Err.Number = 0 And http.Status = 200 Then Exit For
    Next
End If
On Error GoTo 0

' 打开 Chrome 应用窗口
WshShell.Run """" & chromePath & """ --app=http://localhost:3001 --window-size=1280,800", 1, False
