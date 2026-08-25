; ControlStock — cierre forzado antes de instalar / desinstalar.
; Evita el cartel "ControlStock está en ejecución" y la barra trabada a mitad
; (archivos .exe/.dll bloqueados mientras el proceso sigue vivo).

!macro killControlStockProcesses
  DetailPrint "Cerrando ControlStock (puede tardar unos segundos)..."
  StrCpy $R9 0
kill_retry:
  IntOp $R9 $R9 + 1
  nsExec::ExecToLog `"$SYSDIR\taskkill.exe" /F /IM ControlStock.exe /T`
  Sleep 700
  ; ¿Sigue corriendo?
  nsExec::ExecToStack `"$SYSDIR\cmd.exe" /C tasklist /FI "IMAGENAME eq ControlStock.exe" 2>nul | find /I "ControlStock.exe" >nul`
  Pop $R8
  ; find exit 0 = sigue vivo; 1 = ya no está
  IntCmp $R8 0 kill_still_running kill_gone kill_still_running
kill_still_running:
  IntCmp $R9 20 kill_force_wait kill_retry kill_force_wait
kill_force_wait:
  DetailPrint "Esperando a que Windows libere los archivos..."
  Sleep 3000
  Goto kill_done
kill_gone:
  DetailPrint "ControlStock cerrado."
  Sleep 1500
kill_done:
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
