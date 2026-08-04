; Si queda ControlStock.exe en segundo plano (API), el instalador lo fuerza a cerrar.
!macro customCheckAppRunning
  DetailPrint "Cerrando ControlStock si sigue en ejecucion..."
  nsExec::ExecToLog `taskkill /F /IM "ControlStock.exe" /T`
  Sleep 700
  nsExec::ExecToLog `taskkill /F /IM "ControlStock.exe" /T`
  Sleep 500
!macroend
