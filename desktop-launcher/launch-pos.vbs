' POS Till Launcher
' ------------------
' Double-click this file (or the desktop shortcut created by
' install-windows.ps1) to open the POS in a dedicated Microsoft Edge
' window — no tabs, no address bar, no other browser chrome. This is
' what makes it feel like "its own app" rather than just a bookmark.
'
' EDIT THIS LINE to point at your deployment before installing:
POS_URL = "http://localhost:3000"

Set shell = CreateObject("WScript.Shell")

' --app=<url> launches Edge in "app mode": a clean window scoped to
' that one site, with the standard browser tabs/toolbar hidden. This
' is a real, supported Edge command-line flag, not a hack.
edgeArgs = "--app=" & POS_URL

' Try the standard install path first; fall back to letting Windows
' resolve "msedge" from PATH if Edge was installed somewhere else.
edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

If shell.Environment("Process")("ProgramFiles(x86)") <> "" Then
  ' no-op, just confirms Environment object works on this system
End If

On Error Resume Next
Dim fso
Set fso = CreateObject("Scripting.FileSystemObject")
If fso.FileExists(edgePath) Then
  shell.Run """" & edgePath & """ " & edgeArgs, 1, False
Else
  shell.Run "msedge " & edgeArgs, 1, False
End If
On Error Goto 0
