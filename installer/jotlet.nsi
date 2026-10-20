Unicode true
ManifestDPIAware true
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 32

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

!ifdef TEST_ID
  !define PRODUCT_KEY "Software\JotletInstallerTests\${TEST_ID}"
  !define UNINSTALL_KEY "Software\JotletInstallerTests\${TEST_ID}\Uninstall"
  !define CLASSES_KEY "Software\JotletAssociationTests\${TEST_ID}"
!else
  !define PRODUCT_KEY "Software\Jotlet"
  !define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Jotlet"
  !define CLASSES_KEY "Software\Classes"
!endif

Name "Jotlet"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\Jotlet"
InstallDirRegKey HKCU "${PRODUCT_KEY}" "InstallDir"
BrandingText "Jotlet · 让每件事，都有迹可循。"
Icon "${ICON_FILE}"
UninstallIcon "${ICON_FILE}"
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey /LANG=2052 "ProductName" "Jotlet 安装向导"
VIAddVersionKey /LANG=2052 "FileDescription" "Jotlet 安装与卸载"
VIAddVersionKey /LANG=2052 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=2052 "LegalCopyright" "Jotlet"

!define MUI_ABORTWARNING
!define MUI_ICON "${ICON_FILE}"
!define MUI_UNICON "${ICON_FILE}"
!define MUI_BGCOLOR "F8F9F6"
!define MUI_TEXTCOLOR "29372F"
!define MUI_DIRECTORYPAGE_TEXT_TOP "选择 Jotlet 的程序安装文件夹。数据保存目录将在下一步单独设置。"
Page custom ModePage ModeLeave
!define MUI_LICENSEPAGE_TEXT_TOP "Jotlet 仅限非商业用途，请阅读许可条款。"
!insertmacro MUI_PAGE_LICENSE "${PROJECT_LICENSE}"
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE ValidateInstallDirectory
!insertmacro MUI_PAGE_DIRECTORY
Page custom DataPage DataLeave
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\jotlet.exe"
!define MUI_FINISHPAGE_RUN_TEXT "启动 Jotlet"
!insertmacro MUI_PAGE_FINISH

!define MUI_UNCONFIRMPAGE_TEXT_TOP "卸载 Jotlet 程序，保留你的事件、日历、记录和数据保存设置。"
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE "SimpChinese"
SetFont /LANG=${LANG_SIMPCHINESE} "Microsoft YaHei UI" 9

Var Mode
Var DataDir
Var ExistingDir
Var InstallRadio
Var RemoveRadio
Var DataInput
Var PageDialog
Var InstallToken
Var LegacyUninstaller
Var LegacyQuietUninstaller

!macro InvalidDirectory Message
  IfSilent +2
    MessageBox MB_ICONSTOP "${Message}"
  SetErrorLevel 1
  Abort
!macroend

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "此安装包需要 64 位 Windows。"
    SetErrorLevel 1
    Quit
  ${EndIf}
  SetRegView 64
  SetShellVarContext current
  StrCpy $Mode "install"
  StrCpy $DataDir "$DOCUMENTS\Jotlet Data"
  ReadRegStr $ExistingDir HKCU "${PRODUCT_KEY}" "InstallDir"
  ${If} $ExistingDir != ""
    ReadRegStr $DataDir HKCU "${PRODUCT_KEY}" "DataDirectory"
    ReadINIStr $1 "$ExistingDir\jotlet-data.ini" "Jotlet" "DataDirectory"
    ${If} $1 != ""
      StrCpy $DataDir $1
    ${EndIf}
  ${EndIf}
  ${If} $ExistingDir == ""
    ReadRegStr $2 HKCU "${UNINSTALL_KEY}" "DisplayName"
    ReadRegStr $3 HKCU "${UNINSTALL_KEY}" "InstallLocation"
    ${If} $2 == "jotlet"
      IfFileExists "$3\Update.exe" 0 legacy_not_found
      ReadRegStr $LegacyUninstaller HKCU "${UNINSTALL_KEY}" "UninstallString"
      ReadRegStr $LegacyQuietUninstaller HKCU "${UNINSTALL_KEY}" "QuietUninstallString"
    ${EndIf}
  ${EndIf}
  legacy_not_found:
  ${GetParameters} $0
  ${GetOptions} $0 "/MODE=" $1
  ${If} $1 == "uninstall"
    StrCpy $Mode "uninstall"
    Call RunUninstaller
  ${EndIf}
  ${GetOptions} $0 "/DATADIR=" $1
  ${If} $1 != ""
    StrCpy $DataDir $1
  ${EndIf}
  System::Call 'kernel32::GetTickCount64() l .r0'
  StrCpy $InstallToken "$0-$HWNDPARENT"
FunctionEnd

Function ModePage
  !insertmacro MUI_HEADER_TEXT "安装或卸载 Jotlet" "请选择你要执行的操作。"
  nsDialogs::Create 1018
  Pop $PageDialog
  ${NSD_CreateLabel} 0 4u 100% 24u "Jotlet · 随手记"
  Pop $0
  ${NSD_CreateRadioButton} 8u 34u 90% 16u "安装 Jotlet"
  Pop $InstallRadio
  ${NSD_Check} $InstallRadio
  ${NSD_CreateLabel} 22u 55u 90% 18u "选择程序安装目录和数据保存目录。"
  Pop $0
  ${NSD_CreateRadioButton} 8u 84u 90% 16u "卸载 Jotlet"
  Pop $RemoveRadio
  ${NSD_CreateLabel} 22u 105u 90% 26u "删除已安装的程序，保留事件、日程和记录。"
  Pop $0
  IfFileExists "$ExistingDir\Uninstall.exe" available
    ${If} $LegacyUninstaller != ""
      Goto available
    ${EndIf}
    EnableWindow $RemoveRadio 0
  available:
  nsDialogs::Show
FunctionEnd

Function ModeLeave
  ${NSD_GetState} $RemoveRadio $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $Mode "uninstall"
    Call RunUninstaller
  ${EndIf}
FunctionEnd

Function RunUninstaller
  Call CheckApplicationClosed
  ${If} $LegacyUninstaller != ""
    IfSilent legacy_silent legacy_interactive
    legacy_silent:
      ${If} $LegacyQuietUninstaller != ""
        ExecWait '$LegacyQuietUninstaller' $0
      ${Else}
        ExecWait '$LegacyUninstaller' $0
      ${EndIf}
      SetErrorLevel $0
      Quit
    legacy_interactive:
      Exec '$LegacyUninstaller'
      Quit
  ${EndIf}
  IfFileExists "$ExistingDir\Uninstall.exe" found
    IfSilent +2
      MessageBox MB_ICONINFORMATION "没有找到由此安装向导安装的 Jotlet。"
    SetErrorLevel 1
    Quit
  found:
  IfSilent silent interactive
  silent:
    ExecWait '"$ExistingDir\Uninstall.exe" /S _?=$ExistingDir' $0
    ${If} $0 == 0
      Delete "$ExistingDir\Uninstall.exe"
      RMDir "$ExistingDir"
    ${EndIf}
    SetErrorLevel $0
    Quit
  interactive:
    Exec '"$ExistingDir\Uninstall.exe"'
    Quit
FunctionEnd

Function ValidateInstallDirectory
  System::Call 'kernel32::GetFullPathNameW(w "$INSTDIR", i ${NSIS_MAX_STRLEN}, w .r0, p 0) i .r1'
  ${If} $1 == 0
  ${OrIf} $1 >= ${NSIS_MAX_STRLEN}
    !insertmacro InvalidDirectory "程序安装路径无效或过长。"
  ${EndIf}
  StrCpy $INSTDIR $0
  ${GetRoot} "$INSTDIR" $0
  ${If} $INSTDIR == $0
  ${OrIf} $INSTDIR == "$0\"
  ${OrIf} $INSTDIR == ""
    !insertmacro InvalidDirectory "请选择独立的 Jotlet 程序文件夹，不能使用磁盘根目录。"
  ${EndIf}
  ; Allow a new folder or an existing Jotlet installation, never unrelated files.
  ReadINIStr $0 "$INSTDIR\jotlet-install.ini" "Jotlet" "Version"
  ${If} $0 == 1
    Goto valid
  ${EndIf}
  ${DirState} "$INSTDIR" $0
  ${If} $0 == 1
    !insertmacro InvalidDirectory "程序目录不是空文件夹，请选择新的 Jotlet 文件夹。"
  ${EndIf}
  valid:
FunctionEnd

Function DataPage
  !insertmacro MUI_HEADER_TEXT "选择数据保存目录" "事件、记录、日历和自动备份将保存在此文件夹。"
  nsDialogs::Create 1018
  Pop $PageDialog
  ${NSD_CreateLabel} 0 8u 100% 20u "数据保存位置"
  Pop $0
  ${NSD_CreateDirRequest} 0 34u 232u 14u "$DataDir"
  Pop $DataInput
  ${NSD_CreateBrowseButton} 240u 33u 58u 16u "浏览…"
  Pop $0
  ${NSD_OnClick} $0 BrowseData
  ${NSD_CreateLabel} 0 68u 100% 44u "请选择程序安装目录之外的文件夹。$\r$\n安装完成后自动使用此目录，之后也可在应用设置中更改。$\r$\n已有数据会在首次启动时迁移；卸载程序时保留数据。"
  Pop $0
  nsDialogs::Show
FunctionEnd

Function BrowseData
  Pop $0
  ${NSD_GetText} $DataInput $DataDir
  nsDialogs::SelectFolderDialog "选择 Jotlet 数据保存目录" "$DataDir"
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $DataInput $0
  ${EndIf}
FunctionEnd

Function DataLeave
  ${NSD_GetText} $DataInput $DataDir
  Call ValidateDataDirectory
FunctionEnd

Function ValidateDataDirectory
  ${If} $DataDir == ""
    !insertmacro InvalidDirectory "请选择数据保存文件夹。"
  ${EndIf}
  System::Call 'kernel32::GetFullPathNameW(w "$DataDir", i ${NSIS_MAX_STRLEN}, w .r0, p 0) i .r1'
  ${If} $1 == 0
  ${OrIf} $1 >= ${NSIS_MAX_STRLEN}
    !insertmacro InvalidDirectory "数据保存路径无效或过长。"
  ${EndIf}
  StrCpy $DataDir $0
  System::Call 'shlwapi::PathIsPrefixW(w "$INSTDIR", w "$DataDir") i .r0'
  System::Call 'shlwapi::PathIsPrefixW(w "$DataDir", w "$INSTDIR") i .r1'
  ${If} $0 != 0
  ${OrIf} $1 != 0
    !insertmacro InvalidDirectory "程序安装目录与数据保存目录应相互独立，不能互相包含。"
  ${EndIf}
  ClearErrors
  CreateDirectory "$DataDir"
  IfErrors failed
  FileOpen $0 "$DataDir\.jotlet-install-$InstallToken.tmp" w
  IfErrors failed
  FileClose $0
  Delete "$DataDir\.jotlet-install-$InstallToken.tmp"
  Return
  failed:
    !insertmacro InvalidDirectory "无法写入数据保存目录，请选择有写入权限的文件夹。"
FunctionEnd

Function CheckApplicationClosed
!ifndef TEST_ID
  nsProcess::_FindProcess "jotlet.exe"
  Pop $0
  ${If} $0 == 0
    IfSilent +2
      MessageBox MB_ICONEXCLAMATION "请先关闭 Jotlet，再进行安装或卸载。"
    SetErrorLevel 2
    Abort
  ${EndIf}
!endif
FunctionEnd

Section "安装 Jotlet"
  Call CheckApplicationClosed
  Call ValidateInstallDirectory
  Call ValidateDataDirectory
  ${If} $ExistingDir != ""
  ${AndIf} $ExistingDir != $INSTDIR
    IfFileExists "$ExistingDir\Uninstall.exe" 0 old_removed
    ExecWait '"$ExistingDir\Uninstall.exe" /S _?=$ExistingDir' $0
    ${If} $0 != 0
      !insertmacro InvalidDirectory "无法移除旧程序，请关闭 Jotlet 后重试。"
    ${EndIf}
    Delete "$ExistingDir\Uninstall.exe"
    RMDir "$ExistingDir"
  ${EndIf}
  old_removed:
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD_DIR}\*.*"
  FileOpen $0 "$INSTDIR\jotlet-install.ini" w
  FileWriteUTF16LE /BOM $0 "[Jotlet]$\r$\nVersion=1$\r$\nDataDirectory=$DataDir$\r$\nToken=$InstallToken$\r$\n"
  FileClose $0
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${PRODUCT_KEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${PRODUCT_KEY}" "DataDirectory" "$DataDir"
  ReadRegStr $0 HKCU "${CLASSES_KEY}\.jotlet" ""
  ${If} $0 != "Jotlet.Backup"
    WriteRegStr HKCU "${PRODUCT_KEY}" "PreviousJotletAssociation" "$0"
  ${EndIf}
  WriteRegStr HKCU "${CLASSES_KEY}\.jotlet" "" "Jotlet.Backup"
  WriteRegStr HKCU "${CLASSES_KEY}\.jotlet\OpenWithProgids" "Jotlet.Backup" ""
  WriteRegStr HKCU "${CLASSES_KEY}\Jotlet.Backup" "" "Jotlet 完整备份"
  WriteRegStr HKCU "${CLASSES_KEY}\Jotlet.Backup\DefaultIcon" "" '$\"$INSTDIR\jotlet.exe$\",0'
  WriteRegStr HKCU "${CLASSES_KEY}\Jotlet.Backup\shell\open\command" "" '$\"$INSTDIR\jotlet.exe$\" $\"%1$\"'
  !ifndef TEST_ID
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  !endif
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "Jotlet"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Jotlet"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\jotlet.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  !ifndef TEST_ID
    CreateDirectory "$SMPROGRAMS\Jotlet"
    CreateShortcut "$SMPROGRAMS\Jotlet\Jotlet.lnk" "$INSTDIR\jotlet.exe" "" "$INSTDIR\jotlet.exe"
    CreateShortcut "$SMPROGRAMS\Jotlet\卸载 Jotlet.lnk" "$INSTDIR\Uninstall.exe"
    CreateShortcut "$DESKTOP\Jotlet.lnk" "$INSTDIR\jotlet.exe" "" "$INSTDIR\jotlet.exe"
  !endif
  SetErrorLevel 0
SectionEnd

Function un.onInit
  SetRegView 64
  SetShellVarContext current
!ifndef TEST_ID
  nsProcess::_FindProcess "jotlet.exe"
  Pop $0
  ${If} $0 == 0
    IfSilent +2
      MessageBox MB_ICONEXCLAMATION "请先关闭 Jotlet，再卸载。"
    SetErrorLevel 2
    Abort
  ${EndIf}
!endif
FunctionEnd

Section "Uninstall"
  ; Generated manifest deletes only distributed files, never user-created files.
  !include "${UNINSTALL_MANIFEST}"
  Delete "$INSTDIR\jotlet-install.ini"
  Delete "$INSTDIR\jotlet-data.ini"
  Delete "$INSTDIR\jotlet-data.ini.tmp"
  Delete /REBOOTOK "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  ReadRegStr $0 HKCU "${PRODUCT_KEY}" "InstallDir"
  ${If} $0 == $INSTDIR
    ReadRegStr $1 HKCU "${CLASSES_KEY}\Jotlet.Backup\shell\open\command" ""
    ${If} $1 == '$\"$INSTDIR\jotlet.exe$\" $\"%1$\"'
      ReadRegStr $1 HKCU "${CLASSES_KEY}\.jotlet" ""
      ${If} $1 == "Jotlet.Backup"
        ReadRegStr $1 HKCU "${PRODUCT_KEY}" "PreviousJotletAssociation"
        ${If} $1 == ""
          DeleteRegValue HKCU "${CLASSES_KEY}\.jotlet" ""
        ${Else}
          WriteRegStr HKCU "${CLASSES_KEY}\.jotlet" "" "$1"
        ${EndIf}
      ${EndIf}
      DeleteRegValue HKCU "${CLASSES_KEY}\.jotlet\OpenWithProgids" "Jotlet.Backup"
      DeleteRegKey /ifempty HKCU "${CLASSES_KEY}\.jotlet\OpenWithProgids"
      DeleteRegKey /ifempty HKCU "${CLASSES_KEY}\.jotlet"
      DeleteRegKey HKCU "${CLASSES_KEY}\Jotlet.Backup"
      !ifndef TEST_ID
        System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
      !endif
    ${EndIf}
    DeleteRegKey HKCU "${PRODUCT_KEY}"
    DeleteRegKey HKCU "${UNINSTALL_KEY}"
    !ifndef TEST_ID
      Delete "$SMPROGRAMS\Jotlet\Jotlet.lnk"
      Delete "$SMPROGRAMS\Jotlet\卸载 Jotlet.lnk"
      RMDir "$SMPROGRAMS\Jotlet"
      Delete "$DESKTOP\Jotlet.lnk"
    !endif
  ${EndIf}
SectionEnd
