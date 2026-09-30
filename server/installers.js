// "BlueBar Print" for a venue computer, with nothing to install first: bash + curl on
// macOS/Linux, PowerShell on Windows. The installer trades its one-time pairing code
// for the agent key, saves it for this user only, and registers a background agent
// that starts with the computer. The server does the ESC/POS encoding, so the agent
// only moves ready bytes from BlueBar to the printer on the local network.
//
// The texts below are raw strings — the only JS interpolation is ${"$"} where bash needs a
// literal "${". __URL__ and __CODE__ are filled in per request, and are validated to be
// nothing but a URL and 6 digits.

const SH = String.raw`#!/bin/bash
# BlueBar Print — installer for macOS and Linux.
URL='__URL__'
CODE='__CODE__'
DIR="$HOME/.bluebar-print"

echo "BlueBar Print · po lidhet me BlueBar…"
RESP=$(curl -fsS -m 20 -X POST "$URL/api/print/pair?format=lines" \
  -H "x-bluebar-client: 1" -H "content-type: application/json" \
  -d "{\"code\":\"$CODE\"}") || {
  echo "✗ Kodi nuk vlen më. Krijoni një të ri te BlueBar → Cilësimet → Printerët."
  exit 1
}
VENUE=$(printf '%s\n' "$RESP" | sed -n 1p)
KEY=$(printf '%s\n' "$RESP" | sed -n 2p)
NAME=$(printf '%s\n' "$RESP" | sed -n 3p)

mkdir -p "$DIR" && chmod 700 "$DIR"
printf "URL='%s'\nVENUE='%s'\nKEY='%s'\n" "$URL" "$VENUE" "$KEY" > "$DIR/config"
chmod 600 "$DIR/config"

cat > "$DIR/agent.sh" <<'AGENT'
#!/bin/bash
# BlueBar Print agent: collects print jobs and sends them to the venue's printers.
DIR="$HOME/.bluebar-print"
TMP="$DIR/job.bin"
now() { date '+%H:%M:%S'; }
# Raw TCP to the printer (port 9100), given up after 8 seconds.
send() {
  cat "$3" > "/dev/tcp/$1/$2" 2>/dev/null &
  local pid=$!
  ( sleep 8; kill $pid 2>/dev/null ) &
  local watchdog=$!
  wait $pid
  local status=$?
  kill $watchdog 2>/dev/null
  return $status
}
# "usb:<queue>" goes raw through this computer's print queue; anything else is a
# network printer.
deliver() {
  case "$1" in
    usb:*) lp -d "$(printf '%s' "$1" | cut -c5-)" -o raw "$3" > /dev/null 2>&1 ;;
    *) send "$1" "$2" "$3" ;;
  esac
}
echo "$(now) BlueBar Print — po pret fletë…"
while true; do
  # Read every round: pairing again rewrites it, no restart needed.
  . "$DIR/config"
  # This computer's printers (e.g. a USB receipt printer), offered in BlueBar's printer form.
  USB=$(lpstat -e 2>/dev/null | tr '
' ',')
  AUTH=(-H "x-bluebar-client: 1" -H "x-bluebar-venue: $VENUE" -H "authorization: Bearer $KEY" -H "x-bluebar-usb: $USB")
  if JOBS=$(curl -fsS -m 15 "$URL/api/print/jobs?format=lines" "${"$"}{AUTH[@]}"); then
    FAILED=" "
    while read -r ID HOST PORT DATA; do
      [ -z "$ID" ] && continue
      # One failure stops that printer for this round, so nothing prints out of order.
      case "$FAILED" in *" $HOST:$PORT "*) continue ;; esac
      if printf '%s' "$DATA" | base64 --decode > "$TMP" 2>/dev/null && deliver "$HOST" "$PORT" "$TMP"; then
        RESULT='{"ok":true}'
        echo "$(now) ✓ $HOST:$PORT"
      else
        RESULT='{"ok":false,"error":"Printeri nuk u arrit."}'
        FAILED="$FAILED$HOST:$PORT "
        echo "$(now) ✗ $HOST:$PORT nuk u arrit"
      fi
      curl -fsS -m 10 -X POST "$URL/api/print/jobs/$ID" "${"$"}{AUTH[@]}" \
        -H "content-type: application/json" -d "$RESULT" > /dev/null || true
    done <<< "$JOBS"
    sleep 2
  else
    sleep 5
  fi
done
AGENT
chmod 700 "$DIR/agent.sh"

if [ "$(uname)" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/al.bluebar.print.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>al.bluebar.print</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$DIR/agent.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/agent.log</string>
  <key>StandardErrorPath</key><string>$DIR/agent.log</string>
</dict></plist>
PLIST
  launchctl unload "$PLIST" 2>/dev/null
  launchctl load -w "$PLIST"
elif command -v systemctl > /dev/null && systemctl --user show-environment > /dev/null 2>&1; then
  UNIT="$HOME/.config/systemd/user/bluebar-print.service"
  mkdir -p "$(dirname "$UNIT")"
  printf '[Unit]\nDescription=BlueBar Print\nAfter=network-online.target\n\n[Service]\nExecStart=/bin/bash %s/agent.sh\nRestart=always\nRestartSec=5\n\n[Install]\nWantedBy=default.target\n' "$DIR" > "$UNIT"
  systemctl --user daemon-reload
  systemctl --user enable bluebar-print > /dev/null 2>&1
  systemctl --user restart bluebar-print
else
  mkdir -p "$HOME/.config/autostart"
  printf '[Desktop Entry]\nType=Application\nName=BlueBar Print\nExec=/bin/bash %s/agent.sh\nX-GNOME-Autostart-enabled=true\n' "$DIR" > "$HOME/.config/autostart/bluebar-print.desktop"
  pkill -f "$DIR/agent.sh" 2>/dev/null
  nohup /bin/bash "$DIR/agent.sh" >> "$DIR/agent.log" 2>&1 &
fi

echo ""
echo "✓ Gati! Ky kompjuter printon tani për $NAME."
echo "  Niset vetë sa herë ndizet kompjuteri. Mund ta mbyllni këtë dritare."
`;

const PS1 = String.raw`# BlueBar Print — installer for Windows (PowerShell 5.1+).
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Url = '__URL__'
$Code = '__CODE__'
$Dir = Join-Path $env:LOCALAPPDATA 'BlueBar'

Write-Host 'BlueBar Print - po lidhet me BlueBar...'
try {
  $resp = Invoke-RestMethod -UseBasicParsing -Method Post -Uri ($Url + '/api/print/pair?format=lines') -Headers @{ 'x-bluebar-client' = '1' } -ContentType 'application/json' -Body ('{"code":"' + $Code + '"}') -TimeoutSec 20
} catch {
  Write-Host 'X Kodi nuk vlen me. Krijoni nje te ri te BlueBar > Cilesimet > Printeret.' -ForegroundColor Red
  return
}
$lines = $resp -split '\r?\n'

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Set-Content -Path (Join-Path $Dir 'config.txt') -Value @($Url, $lines[0], $lines[1]) -Encoding ASCII

$agent = @'
# BlueBar Print agent: collects print jobs and sends them to the venue's printers.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$mutex = New-Object System.Threading.Mutex($false, 'Local\BlueBarPrint')
if (-not $mutex.WaitOne(0)) { exit }
$Dir = Join-Path $env:LOCALAPPDATA 'BlueBar'
function Send-Job($address, $port, [byte[]]$bytes) {
  if ($address -like 'usb:*') { throw 'USB printers are not supported on Windows yet' }
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    if (-not $client.ConnectAsync($address, [int]$port).Wait(5000)) { throw 'timeout' }
    $stream = $client.GetStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
  } finally { $client.Close() }
}
while ($true) {
  # Read every round: pairing again rewrites it, no restart needed.
  $cfg = Get-Content (Join-Path $Dir 'config.txt')
  $headers = @{ 'x-bluebar-client' = '1'; 'x-bluebar-venue' = $cfg[1]; 'authorization' = ('Bearer ' + $cfg[2]) }
  try {
    $text = Invoke-RestMethod -UseBasicParsing -Uri ($cfg[0] + '/api/print/jobs?format=lines') -Headers $headers -TimeoutSec 15
    $failed = @{}
    foreach ($line in ([string]$text -split '\r?\n')) {
      $f = $line -split ' '
      if ($f.Count -lt 4) { continue }
      $target = $f[1] + ':' + $f[2]
      # One failure stops that printer for this round, so nothing prints out of order.
      if ($failed.ContainsKey($target)) { continue }
      try {
        Send-Job $f[1] $f[2] ([Convert]::FromBase64String($f[3]))
        $result = '{"ok":true}'
      } catch {
        $failed[$target] = $true
        $result = '{"ok":false,"error":"Printeri nuk u arrit."}'
      }
      try { Invoke-RestMethod -UseBasicParsing -Method Post -Uri ($cfg[0] + '/api/print/jobs/' + $f[0]) -Headers $headers -ContentType 'application/json' -Body $result -TimeoutSec 10 | Out-Null } catch {}
    }
    Start-Sleep -Seconds 2
  } catch { Start-Sleep -Seconds 5 }
}
'@
$agentPath = Join-Path $Dir 'agent.ps1'
Set-Content -Path $agentPath -Value $agent -Encoding UTF8

# Start with Windows, hidden, and start right now.
$arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $agentPath + '"'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'BlueBar Print.lnk'))
$shortcut.TargetPath = 'powershell.exe'
$shortcut.Arguments = $arguments
$shortcut.WindowStyle = 7
$shortcut.Save()
Start-Process powershell.exe -ArgumentList $arguments -WindowStyle Hidden

Write-Host ''
Write-Host ('Gati! Ky kompjuter printon tani per ' + $lines[2] + '.') -ForegroundColor Green
Write-Host 'Niset vete sa here ndizet kompjuteri. Mund ta mbyllni kete dritare.'
`;

// Double-click on Windows: fetch the PowerShell installer and run it.
const CMD = [
  "@echo off",
  "title BlueBar Print",
  "powershell -NoProfile -ExecutionPolicy Bypass -Command \"[Net.ServicePointManager]::SecurityProtocol='Tls12'; iex (irm -UseBasicParsing '__URL__/api/print/install/__CODE__.ps1')\"",
  "echo.",
  "pause",
  "",
].join("\r\n");

const TEMPLATES = { sh: SH, ps1: PS1, cmd: CMD };

export function installer(kind, url, code) {
  if (!/^https?:\/\/[a-z0-9.:-]+$/i.test(url) || !/^\d{6}$/.test(code)) throw new Error("Invalid installer input");
  return TEMPLATES[kind].replaceAll("__URL__", url).replaceAll("__CODE__", code);
}
