!macro customInit
  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" install_directory_exists
  IfFileExists "F:\." 0 install_directory_exists
  StrCpy $INSTDIR "F:\ai小说"
install_directory_exists:
!macroend
