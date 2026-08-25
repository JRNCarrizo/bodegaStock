; ControlStock — cierre forzado antes de instalar / desinstalar.
; Evita el cartel "ControlStock está en ejecución" al actualizar.

!macro killControlStockProcesses
  DetailPrint "Cerrando ControlStock..."
  ; Varias pasadas: Electron a veces deja hijos vivos un instante.
  StrCpy $R9 0
kill_retry:
  IntOp $R9 $R9 + 1
  nsExec::ExecToLog `"$SYSDIR\taskkill.exe" /F /IM ControlStock.exe /T`
  nsExec::ExecToLog `"$SYSDIR\cmd.exe" /c taskkill /F /IM ControlStock.exe /T >nul 2>&1 & exit /b 0`
  nsExec::ExecToLog `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'ControlStock*' } | Stop-Process -Force -ErrorAction SilentlyContinue"`
  Sleep 700
  IntCmp $R9 12 kill_done kill_retry kill_done
kill_done:
  Sleep 800
!macroend

!macro skipBrokenOldUninstaller
  ; Sin UninstallString, el instalador nuevo no invoca el Uninstall.exe viejo
  ; (ese es el que falla y dispara el cartel a mitad de instalación).
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "QuietUninstallString"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "QuietUninstallString"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_FILENAME}" "UninstallString"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_FILENAME}" "QuietUninstallString"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_FILENAME}" "UninstallString"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_FILENAME}" "QuietUninstallString"
!macroend

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customInit
  !insertmacro killControlStockProcesses
  BringToFront
!macroend

!macro customCheckAppRunning
  !insertmacro killControlStockProcesses
  !insertmacro skipBrokenOldUninstaller
!macroend

!macro customUnInstallCheck
  !insertmacro killControlStockProcesses
!macroend
