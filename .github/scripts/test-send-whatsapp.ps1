param(
  [switch]$Harness,
  [ValidateSet('Invoke', 'Coordinate')]
  [string]$HarnessMode = 'Invoke',
  [string]$SignalPath
)

$ErrorActionPreference = 'Stop'

if ($Harness) {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  $form = New-Object System.Windows.Forms.Form
  $form.Text = "WhatsApp $HarnessMode Integration Test"
  $form.StartPosition = 'CenterScreen'
  $form.ClientSize = New-Object System.Drawing.Size(720, 360)
  $form.TopMost = $true

  $heading = New-Object System.Windows.Forms.Label
  $heading.Text = "Synthetic WhatsApp $HarnessMode compose window"
  $heading.SetBounds(40, 35, 450, 28)
  $form.Controls.Add($heading)

  if ($HarnessMode -eq 'Invoke') {
    $messageBox = New-Object System.Windows.Forms.TextBox
    $messageBox.Text = 'Ghost integration message'
    $messageBox.AccessibleName = 'Type a message'
    $messageBox.SetBounds(40, 275, 540, 30)

    $sendButton = New-Object System.Windows.Forms.Button
    $sendButton.Text = 'Send'
    $sendButton.AccessibleName = 'Send'
    $sendButton.SetBounds(600, 268, 80, 42)
    $sendButton.Add_Click({
      $messageBox.Text = ''
      [System.IO.File]::WriteAllText($SignalPath, 'clicked')
    })

    $form.Controls.Add($messageBox)
    $form.Controls.Add($sendButton)
    $form.Add_Shown({
      $form.Activate()
      [void]$messageBox.Focus()
    })
  }
  else {
    # Deliberately draw, rather than add, the Send control so that it is absent
    # from the accessibility tree and the coordinate compatibility path is used.
    $form.Add_Paint({
      param($sender, $eventArgs)
      $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(95, 179, 179))
      try {
        $eventArgs.Graphics.FillEllipse($brush, 650, 290, 52, 52)
      }
      finally {
        $brush.Dispose()
      }
    })
    $form.Add_MouseClick({
      param($sender, $eventArgs)
      if ($eventArgs.X -gt 625 -and $eventArgs.Y -gt 265) {
        [System.IO.File]::WriteAllText($SignalPath, 'clicked')
      }
    })
    $form.Add_Shown({ $form.Activate() })
  }

  [void]$form.ShowDialog()
  exit 0
}

function Get-TestHash {
  param([string]$Text)

  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    return ([System.BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  }
  finally {
    $sha256.Dispose()
  }
}

function Test-AutomationMode {
  param(
    [string]$Mode,
    [string]$ExpectedMethod,
    [int]$TimeoutSeconds
  )

  $automationScript = Resolve-Path (Join-Path $PSScriptRoot '..\..\desktop\windows\send-whatsapp.ps1')
  $signal = Join-Path $env:RUNNER_TEMP "ghost-send-$($Mode.ToLowerInvariant())-signal.txt"
  Remove-Item $signal -Force -ErrorAction SilentlyContinue

  $quotedScript = '"' + $PSCommandPath + '"'
  $quotedSignal = '"' + $signal + '"'
  $arguments = "-NoLogo -NoProfile -STA -NonInteractive -ExecutionPolicy Bypass -File $quotedScript -Harness -HarnessMode $Mode -SignalPath $quotedSignal"
  $harnessProcess = Start-Process powershell.exe -ArgumentList $arguments -WindowStyle Hidden -PassThru

  try {
    $windowDeadline = [DateTime]::UtcNow.AddSeconds(12)
    do {
      Start-Sleep -Milliseconds 200
      $harnessProcess.Refresh()
    } while (
      [DateTime]::UtcNow -lt $windowDeadline -and
      ($harnessProcess.MainWindowHandle -eq 0 -or $harnessProcess.MainWindowTitle -notmatch 'WhatsApp')
    )

    if ($harnessProcess.HasExited) {
      throw "Synthetic $Mode process exited with code $($harnessProcess.ExitCode)"
    }
    if ($harnessProcess.MainWindowHandle -eq 0) {
      throw "Synthetic $Mode WhatsApp window did not become available"
    }

    $output = & powershell.exe -NoLogo -NoProfile -NonInteractive `
      -ExecutionPolicy Bypass `
      -File $automationScript `
      -GhostProcessId $PID `
      -ExpectedMessageHash (Get-TestHash 'Ghost integration message') `
      -TargetKind Web `
      -TimeoutSeconds $TimeoutSeconds
    $automationExit = $LASTEXITCODE
    $result = $output | Where-Object { $_ -match '^\{' } | Select-Object -Last 1 | ConvertFrom-Json

    if ($automationExit -ne 0) {
      throw "$Mode automation exited with $automationExit: $($result.method): $($result.detail)"
    }
    if (-not $result.ok -or $result.method -ne $ExpectedMethod) {
      throw "$Mode automation returned the wrong method: $($result | ConvertTo-Json -Compress)"
    }
    if (-not (Test-Path $signal -PathType Leaf)) {
      throw "Synthetic $Mode Send target was not activated"
    }

    Write-Host "Windows $Mode integration passed: $($result.method)"
  }
  finally {
    if ($harnessProcess -and -not $harnessProcess.HasExited) {
      Stop-Process -Id $harnessProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $signal -Force -ErrorAction SilentlyContinue
    $global:LASTEXITCODE = 0
  }
}

Test-AutomationMode 'Invoke' 'uia-invoke' 12
Test-AutomationMode 'Coordinate' 'composer-adjacent-click' 14
