; Installer per Windows (Inno Setup 6). Compilato da .github/workflows/installer.yml: iscc pnp-dashboard.iss
; Contiene solo setup.ps1 e l'icona: Docker, Node.js e il progetto li scarica setup.ps1 durante l'installazione.
; All'avvio chiede la lingua (inglese o italiano): vale per l'installer, per setup.ps1 e come prima lingua del launcher.
; Disinstallazione: ferma e cancella container e immagini Docker, chiede se tenere le campagne (cartella data).

#define AppName "Pokémon Pen & Paper"

[Setup]
AppId={{4A79D1F9-931E-4A07-92C8-5F8AC3D572E0}
AppName={#AppName}
AppVersion=1.0
AppPublisher=Ercole24
AppPublisherURL=https://github.com/Ercole24/pokemon-pen-and-paper-dashboard
DefaultDirName={localappdata}\pnp-dashboard
DisableProgramGroupPage=yes
; cartella fissa: installazione e disinstallazione ne cancellano il contenuto (tranne data), mai una cartella scelta a caso
DisableDirPage=yes
ShowLanguageDialog=yes
PrivilegesRequired=lowest
OutputBaseFilename=pnp-dashboard-setup
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\installer\windows\icon.ico
WizardStyle=modern
Compression=lzma2
SolidCompression=yes

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "it"; MessagesFile: "compiler:Languages\Italian.isl"

[CustomMessages]
en.Downloading=Installing Docker and Node.js if missing and downloading the project...
it.Downloading=Installo Docker e Node.js se mancano e scarico il progetto...
en.KeepData=Keep the campaigns (folder %1)?
it.KeepData=Tenere le campagne (cartella %1)?

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "setup.ps1"; DestDir: "{app}\installer\windows"; Flags: ignoreversion
Source: "icon.ico"; DestDir: "{app}\installer\windows"; Flags: ignoreversion

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\windows\setup.ps1"" -Dir ""{app}"" -Lang {language}"; StatusMsg: "{cm:Downloading}"; Flags: waituntilterminated

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\installer\windows\avvia.bat"; WorkingDir: "{app}"; IconFilename: "{app}\installer\windows\icon.ico"; Flags: runminimized
Name: "{autoprograms}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\installer\windows\avvia.bat"; WorkingDir: "{app}"; IconFilename: "{app}\installer\windows\icon.ico"; Flags: runminimized; Tasks: desktopicon

[Code]
{ Prima di togliere i file: ferma e cancella container e immagini, poi cancella tutto tranne (se richiesto) la cartella data. }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Code: Integer;
  KeepData: Boolean;
  App: String;
  F: TFindRec;
begin
  if CurUninstallStep <> usUninstall then Exit;
  App := ExpandConstant('{app}');
  Exec(ExpandConstant('{cmd}'), '/c docker compose down --rmi all -v', App, SW_HIDE, ewWaitUntilTerminated, Code);
  KeepData := DirExists(App + '\data') and
    (MsgBox(FmtMessage(CustomMessage('KeepData'), [App + '\data']), mbConfirmation, MB_YESNO) = IDYES);
  if FindFirst(App + '\*', F) then
  try
    repeat
      if (F.Name <> '.') and (F.Name <> '..') and (Copy(F.Name, 1, 5) <> 'unins') and not (KeepData and (F.Name = 'data')) then
      begin
        if F.Attributes and FILE_ATTRIBUTE_DIRECTORY <> 0 then DelTree(App + '\' + F.Name, True, True, True)
        else DeleteFile(App + '\' + F.Name);
      end;
    until not FindNext(F);
  finally
    FindClose(F);
  end;
end;
