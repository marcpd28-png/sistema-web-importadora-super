# Uses the existing isolated database credentials only in this process.
# No migrations, workers, automatic delivery, or secret-file modifications.
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '../..'))
$rockyContainer = (docker inspect rocky-test-db | ConvertFrom-Json)[0]
if (-not $rockyContainer.State.Running) { throw 'ROCKY_TEST_DATABASE_STOPPED' }
$rockyVars = @{}
foreach ($entry in $rockyContainer.Config.Env) {
    $parts = $entry.Split('=', 2)
    $rockyVars[$parts[0]] = $parts[1]
}
if ($rockyVars.POSTGRES_DB -ne 'rocky_test') { throw 'ISOLATED_DATABASE_REQUIRED' }
$rockyUser = if ($rockyVars.POSTGRES_USER) { $rockyVars.POSTGRES_USER } else { 'postgres' }
$env:DATABASE_URL = 'postgresql://' + [Uri]::EscapeDataString($rockyUser) + ':' + [Uri]::EscapeDataString($rockyVars.POSTGRES_PASSWORD) + '@127.0.0.1:5437/rocky_test'
$env:ROCKY_AUTO_ENABLED = 'false'
$env:PUSHER_APP_ID = '12345'
$env:NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3101'
node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3101
