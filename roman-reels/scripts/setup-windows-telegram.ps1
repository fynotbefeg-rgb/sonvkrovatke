# Owner uses this local form via remote desktop. Never put values in Claude/chat.
# No network calls, no polling/deployment, no environment or startup modifications.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Security
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Factory_reels_bot: local private setup'
$form.Width = 700
$form.Height = 370
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$boxes = @()
$names = @('BotFather token', 'Your numeric Telegram ID', 'Apps Script deployment URL', 'Apps Script webhook token')
for ($i = 0; $i -lt 4; $i++) {
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $names[$i]
    $label.SetBounds(15, (20 + $i * 55), 240, 20)
    $box = New-Object System.Windows.Forms.TextBox
    $box.SetBounds(260, (18 + $i * 55), 395, 25)
    $box.UseSystemPasswordChar = ($i -eq 0 -or $i -eq 3)
    $form.Controls.Add($label)
    $form.Controls.Add($box)
    $boxes += $box
}
$status = New-Object System.Windows.Forms.Label
$status.SetBounds(15, 240, 640, 45)
$status.Text = 'Enter values yourself. Do not use screenshots, transcripts or chat.'
$form.Controls.Add($status)
$save = New-Object System.Windows.Forms.Button
$save.Text = 'Save encrypted locally'
$save.SetBounds(390, 285, 265, 30)
$form.Controls.Add($save)
$save.Add_Click({
    try {
        $botToken = $boxes[0].Text
        $operatorId = $boxes[1].Text.Trim()
        $webhookUrl = $boxes[2].Text.Trim()
        $webhookToken = $boxes[3].Text
        if ($botToken -cnotmatch '^\d{5,16}:[A-Za-z0-9_-]{20,200}$' -or
            $operatorId -notmatch '^[1-9][0-9]{0,15}$' -or [decimal]$operatorId -gt 9007199254740991 -or
            $webhookUrl -cnotmatch '^https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec$' -or
            [string]::IsNullOrWhiteSpace($webhookToken) -or $webhookToken.Length -gt 4096 -or
            $webhookToken -match "[\r\n\x00]") {
            $status.Text = 'Check the four fields. Nothing saved.'
            return
        }
        $directory = Join-Path $env:LOCALAPPDATA 'RomanReels\telegram-panel'
        $file = Join-Path $directory 'config.dpapi'
        if (Test-Path -LiteralPath $file) {
            $status.Text = 'Configuration already exists. Not overwritten.'
            return
        }
        $config = [ordered]@{configVersion='1.0.0';botUsername='Factory_reels_bot';botToken=$botToken;
            operatorIds=@($operatorId);webhookUrl=$webhookUrl;webhookToken=$webhookToken}
        $plain = [Text.Encoding]::UTF8.GetBytes(($config | ConvertTo-Json -Compress))
        $encrypted = [Security.Cryptography.ProtectedData]::Protect($plain, $null, 'CurrentUser')
        [IO.Directory]::CreateDirectory($directory) | Out-Null
        $stream = [IO.File]::Open($file, 'CreateNew', 'Write', 'None')
        try {
            $bytes = [Text.Encoding]::UTF8.GetBytes([Convert]::ToBase64String($encrypted))
            $stream.Write($bytes, 0, $bytes.Length)
            $stream.Flush()
        } finally { $stream.Dispose() }
        foreach ($box in $boxes) { $box.Clear() }
        [Array]::Clear($plain, 0, $plain.Length)
        $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
        $form.Close()
    } catch { $status.Text = 'Could not save configuration. No private error details shown.' }
})
$form.Add_FormClosed({ foreach ($box in $boxes) { $box.Clear() } })
$form.ShowDialog() | Out-Null
$form.Dispose()
