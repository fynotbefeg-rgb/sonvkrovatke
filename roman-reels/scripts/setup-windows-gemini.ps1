# Owner enters values locally. No network, environment changes, clipboard reads, or secret output.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Security
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Gemini: private local setup'
$form.Width = 660
$form.Height = 330
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$keyBox = New-Object System.Windows.Forms.TextBox
$keyBox.SetBounds(180, 25, 440, 25)
$keyBox.UseSystemPasswordChar = $true
$projectBox = New-Object System.Windows.Forms.TextBox
$projectBox.SetBounds(180, 75, 440, 25)
$projectBox.Text = 'Default Gemini Project'
foreach ($pair in @(@('API key',25), @('Google project',75))) {
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $pair[0]
    $label.SetBounds(15, [int]$pair[1], 160, 25)
    $form.Controls.Add($label)
}
$free = New-Object System.Windows.Forms.CheckBox
$free.Text = 'I checked Free tier for THIS key and project in AI Studio'
$free.SetBounds(15, 125, 605, 30)
$status = New-Object System.Windows.Forms.Label
$status.Text = 'Enter the key yourself. Do not put it in chat, screenshots or terminal commands.'
$status.SetBounds(15, 165, 605, 45)
$save = New-Object System.Windows.Forms.Button
$save.Text = 'Save encrypted locally'
$save.SetBounds(360, 230, 260, 30)
foreach ($control in @($keyBox,$projectBox,$free,$status,$save)) { $form.Controls.Add($control) }
$save.Add_Click({
    $plain = $null
    try {
        $project = $projectBox.Text.Trim()
        if ($keyBox.Text -cnotmatch '^[A-Za-z0-9_.-]{20,256}$' -or
            [string]::IsNullOrWhiteSpace($project) -or $project.Length -gt 200 -or
            $project -match "[\r\n\x00]" -or -not $free.Checked) {
            $status.Text = 'Check the key, project and Free tier confirmation. Nothing saved.'
            return
        }
        $directory = Join-Path $env:LOCALAPPDATA 'RomanReels\gemini'
        $file = Join-Path $directory 'config.dpapi'
        if (Test-Path -LiteralPath $file) {
            $status.Text = 'Private config already exists; not overwritten.'
            return
        }
        $config = [ordered]@{configVersion='1.0.0';apiKey=$keyBox.Text;projectName=$project;quotaTierReported='Free'}
        $plain = [Text.Encoding]::UTF8.GetBytes(($config | ConvertTo-Json -Compress))
        $encrypted = [Security.Cryptography.ProtectedData]::Protect($plain, $null, 'CurrentUser')
        [IO.Directory]::CreateDirectory($directory) | Out-Null
        $stream = [IO.File]::Open($file, 'CreateNew', 'Write', 'None')
        try {
            $bytes = [Text.Encoding]::UTF8.GetBytes([Convert]::ToBase64String($encrypted))
            $stream.Write($bytes, 0, $bytes.Length)
            $stream.Flush()
        } finally { $stream.Dispose() }
        $keyBox.Clear()
        $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
        $form.Close()
    } catch { $status.Text = 'Private config was not confirmed. No error details shown.' }
    finally { if ($null -ne $plain) { [Array]::Clear($plain, 0, $plain.Length) } }
})
$form.Add_FormClosed({ $keyBox.Clear() })
$form.ShowDialog() | Out-Null
$form.Dispose()
