; ControlStock — cierre rápido antes de instalar / desinstalar.
; Evita el cartel "ControlStock está en ejecución" y pausas largas con la barra a mitad.

!macro killControlStockProcesses
  DetailPrint "Cerrando ControlStock..."
  nsExec::ExecToLog `"$SYSDIR\taskkill.exe" /F /IM ControlStock.exe /T`
  Sleep 350
  StrCpy $R9 0
kill_retry:
  IntOp $R9 $R9 + 1
  nsExec::ExecToStack `"$SYSDIR\cmd.exe" /C tasklist /FI "IMAGENAME eq ControlStock.exe" 2>nul | find /I "ControlStock.exe" >nul`
  Pop $R8
  IntCmp $R8 0 kill_still_running kill_done kill_done
kill_still_running:
  IntCmp $R9 6 kill_done kill_loop kill_done
kill_loop:
  nsExec::ExecToLog `"$SYSDIR\taskkill.exe" /F /IM ControlStock.exe /T`
  Sleep 200
  Goto kill_retry
kill_done:
  DetailPrint "ControlStock cerrado."
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
