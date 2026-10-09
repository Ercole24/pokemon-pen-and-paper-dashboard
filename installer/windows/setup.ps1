# Parte "vera" dell'installer per Windows, lanciata da pnp-dashboard.iss dopo aver scelto la lingua.
# 1. Docker Desktop e Node.js: se mancano li installa con winget (o apre la pagina per scaricarli);
# 2. scarica da GitHub l'ultima release (senza release: il ramo main; PNP_ARCHIVE = altro URL o file .zip locale, utile per provare) dentro -Dir,
#    tenendo campagne (data), scelte del launcher e il disinstallatore di Inno Setup;
# 3. prima installazione: il launcher parte nella lingua scelta nell'installer (-Lang en|it).
param([Parameter(Mandatory)][string]$Dir, [string]$Lang = 'en')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # la barra di avanzamento rallenta molto Invoke-WebRequest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Repo = 'Ercole24/pokemon-pen-and-paper-dashboard'
# codice dell'ultima release (gli aggiornamenti dal launcher usano le stesse release); senza release, il ramo main
$Archive = if ($env:PNP_ARCHIVE) { $env:PNP_ARCHIVE } else {
  try { (Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest" -UseBasicParsing).zipball_url }
  catch { "https://github.com/$Repo/archive/refs/heads/main.zip" }
}

# testo nella lingua scelta: M "inglese" "italiano"
function M($en, $it) { if ($Lang -eq 'it') { $it } else { $en } }
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function RefreshPath { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function NodeOk { (Has node) -and ([int](node -p 'process.versions.node.split(".")[0]') -ge 22) }
# installa con winget; senza winget apre la pagina di download e aspetta
function Install($id, $page, $what) {
  if (Has winget) { winget install -e --id $id --accept-package-agreements --accept-source-agreements }
  else { Start-Process $page; Read-Host (M "Install $what, then press Enter" "Installa $what, poi premi Invio") }
  RefreshPath
}

try {
  $restart = $false
  if (-not (Has docker)) {
    Write-Host ("`n" + (M 'Installing Docker Desktop (it runs the dashboard and Showdown)...' 'Installo Docker Desktop (serve per la dashboard e Showdown)...')) -ForegroundColor Cyan
    Install 'Docker.DockerDesktop' 'https://www.docker.com/products/docker-desktop/' 'Docker Desktop'
    $restart = $true
  }
  if (-not (NodeOk)) {
    Write-Host ("`n" + (M 'Installing Node.js (the start window needs it)...' 'Installo Node.js (serve alla finestra di avvio)...')) -ForegroundColor Cyan
    Install 'OpenJS.NodeJS.LTS' 'https://nodejs.org/en/download' 'Node.js'
  }

  Write-Host ("`n" + (M "Downloading Pokemon Pen & Paper to $Dir..." "Scarico Pokemon Pen & Paper in $Dir...")) -ForegroundColor Cyan
  $tmp = Join-Path $env:TEMP "pnp-dashboard-$(Get-Random)"
  New-Item -ItemType Directory -Path $tmp | Out-Null
  $zip = Join-Path $tmp 'src.zip'
  if (Test-Path $Archive) { Copy-Item $Archive $zip } else { Invoke-WebRequest $Archive -OutFile $zip -UseBasicParsing }
  Expand-Archive $zip -DestinationPath $tmp
  $src = Get-ChildItem $tmp -Directory | Select-Object -First 1
  # aggiornamento: sostituisce il codice, tiene campagne, scelte del launcher e disinstallatore;
  # solo in una cartella vuota o già nostra (mai cancellare file di altri)
  $others = Get-ChildItem $Dir -Force | Where-Object { $_.Name -notin 'data', '.launcher.json', 'installer' -and $_.Name -notlike 'unins*' }
  if ($others -and -not (Test-Path "$Dir\compose.yaml")) { throw (M "The folder $Dir contains other files: choose an empty one." "La cartella $Dir contiene altri file: scegline una vuota.") }
  Get-ChildItem $Dir -Force | Where-Object { $_.Name -notin 'data', '.launcher.json' -and $_.Name -notlike 'unins*' } | Remove-Item -Recurse -Force
  Copy-Item "$($src.FullName)\*" $Dir -Recurse -Force
  Remove-Item $tmp -Recurse -Force
  $settings = Join-Path $Dir '.launcher.json'
  if (-not (Test-Path $settings)) { [IO.File]::WriteAllText($settings, "{`"lang`": `"$Lang`"}`n") }

  Write-Host ("`n" + (M 'Done!' 'Fatto!')) -ForegroundColor Green
  if ($restart) {
    Write-Host (M 'Docker Desktop was just installed: restart the computer, open Docker Desktop once and accept its terms before the first start.' "Docker Desktop e' appena stato installato: riavvia il PC, apri Docker Desktop una volta e accetta le condizioni prima del primo avvio.") -ForegroundColor Yellow
    Read-Host (M 'Press Enter to close' 'Premi Invio per chiudere')
  }
} catch {
  Write-Host ("`n" + (M 'Error' 'Errore') + ": $_") -ForegroundColor Red
  Read-Host (M 'Press Enter to close' 'Premi Invio per chiudere')
  exit 1
}
