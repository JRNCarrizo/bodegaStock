; ControlStock — cierre forzado + evita el desinstalador viejo que falla al actualizar.
; El diálogo "no se puede cerrar" sale cuando uninstallOldVersion reintenta 5 veces
; porque el Uninstall.exe anterior aborta en modo silencioso.

!macro killControlStockProcesses
  DetailPrint "Cerrando ControlStock..."
  nsExec::ExecToLog `"$SYSDIR\cmd.exe" /c taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T >nul 2>&1 & exit /b 0`
  Sleep 400
  nsExec::ExecToLog `"$SYSDIR\cmd.exe" /c taskkill /F /IM ControlStock.exe /T >nul 2>&1 & exit /b 0`
  Sleep 800
  nsExec::ExecToLog `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "Get-Process -Name 'ControlStock' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; exit 0"`
  Sleep 1200
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

!macro customInit
  !insertmacro killControlStockProcesses
!macroend

!macro customCheckAppRunning
  !insertmacro killControlStockProcesses
  !insertmacro skipBrokenOldUninstaller
!macroend

!macro customUnInstallCheck
  !insertmacro killControlStockProcesses
!macroend
