; ControlStock — cierre forzado antes de instalar / desinstalar.
; Evita el cartel "ControlStock está en ejecución" al actualizar.

!macro killControlStockProcesses
  DetailPrint "Cerrando ControlStock..."
  StrCpy $R9 0
kill_retry:
  IntOp $R9 $R9 + 1
  nsExec::ExecToLog `"$SYSDIR\taskkill.exe" /F /IM ControlStock.exe /T`
  Sleep 400
  IntCmp $R9 6 kill_done kill_retry kill_done
kill_done:
  Sleep 500
!macroend

!macro skipBrokenOldUninstaller
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
