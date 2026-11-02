$ErrorActionPreference = 'Stop'

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
    [string]$HarnessExe,
    [string]$Mode,
    [string]$ExpectedMethod,
    [int]$TimeoutSeconds
  )

  $automationScript = Resolve-Path (Join-Path $PSScriptRoot '..\..\desktop\windows\send-whatsapp.ps1')
  $signal = Join-Path $env:RUNNER_TEMP "ghost-send-$($Mode.ToLowerInvariant())-signal.txt"
  Remove-Item $signal -Force -ErrorAction SilentlyContinue

  $arguments = "`"$Mode`" `"$signal`""
  $harnessProcess = Start-Process $HarnessExe -ArgumentList $arguments -PassThru

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
    $resultLine = $output | Where-Object { $_ -match '^\{' } | Select-Object -Last 1
    if (-not $resultLine) {
      throw "$Mode automation returned no JSON result: $($output -join ' | ')"
    }
    $result = $resultLine | ConvertFrom-Json

    if ($automationExit -ne 0) {
      throw "$Mode automation exited with ${automationExit}: $($result.method): $($result.detail)"
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

$harnessExe = Join-Path $env:RUNNER_TEMP 'GhostUiHarness.exe'
Remove-Item $harnessExe -Force -ErrorAction SilentlyContinue
$harnessSource = @'
using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

public static class GhostWhatsAppHarness
{
    [STAThread]
    public static void Main(string[] args)
    {
        string mode = args.Length > 0 ? args[0] : "Invoke";
        string signalPath = args.Length > 1 ? args[1] : "ghost-signal.txt";

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        Form form = new Form();
        form.Text = "WhatsApp " + mode + " Integration Test";
        form.StartPosition = FormStartPosition.CenterScreen;
        form.ClientSize = new Size(720, 360);
        form.TopMost = true;

        Label heading = new Label();
        heading.Text = "Synthetic WhatsApp " + mode + " compose window";
        heading.SetBounds(40, 35, 450, 28);
        form.Controls.Add(heading);

        if (mode == "Invoke")
        {
            TextBox messageBox = new TextBox();
            messageBox.Text = "Ghost integration message";
            messageBox.AccessibleName = "Type a message";
            messageBox.SetBounds(40, 275, 540, 30);

            Button sendButton = new Button();
            sendButton.Text = "Send";
            sendButton.AccessibleName = "Send";
            sendButton.SetBounds(600, 268, 80, 42);
            sendButton.Click += delegate
            {
                messageBox.Text = "";
                File.WriteAllText(signalPath, "clicked");
            };

            form.Controls.Add(messageBox);
            form.Controls.Add(sendButton);
            form.Shown += delegate
            {
                form.Activate();
                messageBox.Focus();
            };
        }
        else
        {
            form.Paint += delegate(object sender, PaintEventArgs e)
            {
                using (SolidBrush brush = new SolidBrush(Color.FromArgb(95, 179, 179)))
                {
                    e.Graphics.FillEllipse(brush, 650, 290, 52, 52);
                }
            };
            form.MouseClick += delegate(object sender, MouseEventArgs e)
            {
                if (e.X > 625 && e.Y > 265)
                {
                    File.WriteAllText(signalPath, "clicked");
                }
            };
            form.Shown += delegate { form.Activate(); };
        }

        Application.Run(form);
    }
}
'@

try {
  Add-Type -TypeDefinition $harnessSource `
    -Language CSharp `
    -ReferencedAssemblies @('System.Windows.Forms.dll', 'System.Drawing.dll') `
    -OutputAssembly $harnessExe `
    -OutputType WindowsApplication

  Test-AutomationMode $harnessExe 'Invoke' 'uia-invoke' 12
  Test-AutomationMode $harnessExe 'Coordinate' 'composer-adjacent-click' 14
}
catch {
  $message = $_.Exception.Message.Replace("`r", ' ').Replace("`n", ' ')
  Write-Host "::error file=.github/scripts/test-send-whatsapp.ps1,line=1,title=Windows Send integration failed::$message"
  throw
}
finally {
  Remove-Item $harnessExe -Force -ErrorAction SilentlyContinue
  $global:LASTEXITCODE = 0
}
