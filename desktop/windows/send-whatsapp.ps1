param(
  [Parameter(Mandatory = $true)]
  [int]$GhostProcessId,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-fA-F0-9]{64}$')]
  [string]$ExpectedMessageHash,

  [Parameter(Mandatory = $true)]
  [ValidateSet('Desktop', 'Web')]
  [string]$TargetKind,

  [ValidateRange(3, 60)]
  [int]$TimeoutSeconds = 18
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName WindowsBase

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class GhostDesktopWindowApi
{
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
}
'@

$MouseLeftDown = 0x0002
$MouseLeftUp = 0x0004
$RestoreWindow = 9
$startedAt = [DateTime]::UtcNow
$deadline = $startedAt.AddSeconds($TimeoutSeconds)
$unverifiedActionAt = $startedAt.AddMilliseconds(4000)
$enterFallbackAt = $startedAt.AddMilliseconds([Math]::Min(12000, $TimeoutSeconds * 700))
$sendNamePattern = '^(send|send message|enviar|envoyer|senden|invia|invia messaggio|kirim)$'
$messageNamePattern = '^(type a message|message|write a message|enter a message)$'

function Write-GhostResult {
  param(
    [bool]$Ok,
    [string]$Method,
    [string]$Detail,
    [int]$ExitCode
  )

  [ordered]@{
    ok = $Ok
    method = $Method
    detail = $Detail
  } | ConvertTo-Json -Compress | Write-Output
  exit $ExitCode
}

function Get-WhatsAppWindow {
  $windows = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    if ($_.Id -eq $GhostProcessId -or $_.MainWindowHandle -eq 0) {
      $false
    }
    elseif ($TargetKind -eq 'Web') {
      $_.ProcessName -notmatch '(?i)WhatsApp' -and
      $_.MainWindowTitle -match '(?i)WhatsApp' -and
      $_.MainWindowTitle -notmatch '(?i)^Ghost.*WhatsApp Scheduler'
    }
    else {
      $_.ProcessName -match '(?i)WhatsApp'
    }
  }

  return $windows |
    Sort-Object -Property @{ Expression = { $_.StartTime }; Descending = $true } |
    Select-Object -First 1
}

function Focus-WhatsAppWindow {
  param(
    [System.Diagnostics.Process]$Target,
    [IntPtr]$Handle
  )

  [void][GhostDesktopWindowApi]::ShowWindowAsync($Handle, $RestoreWindow)
  Start-Sleep -Milliseconds 100
  [void][GhostDesktopWindowApi]::SetForegroundWindow($Handle)
  Start-Sleep -Milliseconds 100

  if ([GhostDesktopWindowApi]::GetForegroundWindow() -ne $Handle) {
    try {
      $keyboard = New-Object -ComObject WScript.Shell
      [void]$keyboard.AppActivate($Target.Id)
      Start-Sleep -Milliseconds 120
    }
    catch {}
  }

  return [GhostDesktopWindowApi]::GetForegroundWindow() -eq $Handle
}

function Get-ElementText {
  param([System.Windows.Automation.AutomationElement]$Element)

  try {
    return "$(($Element.Current.Name)) $(($Element.Current.AutomationId))".Trim()
  }
  catch {
    return ''
  }
}

function Test-ActionableElement {
  param([System.Windows.Automation.AutomationElement]$Element)

  if (-not $Element) {
    return $false
  }

  try {
    $rectangle = $Element.Current.BoundingRectangle
    return (
      $Element.Current.IsEnabled -and
      -not $Element.Current.IsOffscreen -and
      $rectangle.Width -gt 4 -and
      $rectangle.Height -gt 4
    )
  }
  catch {
    return $false
  }
}

function Find-SendButton {
  param([System.Windows.Automation.AutomationElement]$Root)

  $buttonCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button
  )

  $buttons = $Root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    $buttonCondition
  )

  $automationIdCandidate = $null
  for ($index = 0; $index -lt $buttons.Count; $index += 1) {
    $button = $buttons.Item($index)
    try {
      $name = "$(($button.Current.Name))".Trim()
      $automationId = "$(($button.Current.AutomationId))".Trim()
      if ($name -match "(?i)$sendNamePattern" -and (Test-ActionableElement $button)) {
        return $button
      }
      if (
        -not $automationIdCandidate -and
        $automationId -match '(?i)(^|[-_])(send|sendbutton|send-message)([-_]|$)' -and
        (Test-ActionableElement $button)
      ) {
        $automationIdCandidate = $button
      }
    }
    catch {
      continue
    }
  }

  if ($automationIdCandidate) {
    return $automationIdCandidate
  }

  $sendNameCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::NameProperty,
    'Send',
    [System.Windows.Automation.PropertyConditionFlags]::IgnoreCase
  )
  $candidate = $Root.FindFirst(
    [System.Windows.Automation.TreeScope]::Descendants,
    $sendNameCondition
  )
  if (Test-ActionableElement $candidate) {
    return $candidate
  }

  return $null
}

function Find-MessageEditor {
  param([System.Windows.Automation.AutomationElement]$Root)

  $editControlCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Edit
  )
  $documentControlCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Document
  )
  $editCondition = [System.Windows.Automation.OrCondition]::new(
    [System.Windows.Automation.Condition[]]@(
      $editControlCondition,
      $documentControlCondition
    )
  )

  $editors = $Root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    $editCondition
  )

  $namedCandidate = $null
  $positionCandidate = $null
  $rootThreshold = 0
  try {
    $rootRectangle = $Root.Current.BoundingRectangle
    $rootThreshold = $rootRectangle.Top + ($rootRectangle.Height * 0.58)
  }
  catch {}

  for ($index = 0; $index -lt $editors.Count; $index += 1) {
    $editor = $editors.Item($index)
    try {
      $rectangle = $editor.Current.BoundingRectangle
      if (
        -not $editor.Current.IsKeyboardFocusable -or
        $editor.Current.IsOffscreen -or
        $rectangle.Width -le 120 -or
        $rectangle.Height -le 18
      ) {
        continue
      }

      $label = Get-ElementText $editor
      $isInComposerRegion = $rootThreshold -eq 0 -or $rectangle.Bottom -gt $rootThreshold
      if (
        $isInComposerRegion -and
        ($label -match "(?i)$messageNamePattern" -or $label -match '(?i)(composer|message-input)')
      ) {
        $namedCandidate = $editor
      }
      if ($isInComposerRegion) {
        $positionCandidate = $editor
      }
    }
    catch {
      continue
    }
  }

  if ($namedCandidate) {
    return $namedCandidate
  }
  return $positionCandidate
}

function Get-EditorTextState {
  param([System.Windows.Automation.AutomationElement]$Editor)

  if (-not $Editor) {
    return [PSCustomObject]@{ available = $false; text = '' }
  }

  $patternAvailable = $false
  $candidates = @()

  try {
    $valuePattern = $null
    if ($Editor.TryGetCurrentPattern(
      [System.Windows.Automation.ValuePattern]::Pattern,
      [ref]$valuePattern
    )) {
      $patternAvailable = $true
      $typedValuePattern = [System.Windows.Automation.ValuePattern]$valuePattern
      $candidates += [string]$typedValuePattern.Current.Value
    }
  }
  catch {}

  try {
    $textPattern = $null
    if ($Editor.TryGetCurrentPattern(
      [System.Windows.Automation.TextPattern]::Pattern,
      [ref]$textPattern
    )) {
      $patternAvailable = $true
      $typedTextPattern = [System.Windows.Automation.TextPattern]$textPattern
      $candidates += [string]$typedTextPattern.DocumentRange.GetText(-1)
    }
  }
  catch {}

  try {
    $name = [string]$Editor.Current.Name
    if ($name -and $name -notmatch "(?i)$messageNamePattern") {
      $candidates += $name
    }
  }
  catch {}

  foreach ($candidate in $candidates) {
    if ((Get-TextHash $candidate) -eq $ExpectedMessageHash.ToLowerInvariant()) {
      return [PSCustomObject]@{ available = $true; text = $candidate }
    }
  }

  $nonPlaceholder = $candidates |
    Where-Object { $_ -and $_ -notmatch "(?i)$messageNamePattern" } |
    Select-Object -First 1
  if ($null -ne $nonPlaceholder) {
    return [PSCustomObject]@{ available = $true; text = [string]$nonPlaceholder }
  }
  if ($patternAvailable) {
    return [PSCustomObject]@{ available = $true; text = '' }
  }

  return [PSCustomObject]@{ available = $false; text = '' }
}

function Get-TextHash {
  param([string]$Text)

  $normalized = ([string]$Text).Replace("`r`n", "`n").Replace("`r", "`n").TrimEnd()
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($normalized)
    return ([System.BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  }
  finally {
    $sha256.Dispose()
  }
}

function Test-ExpectedComposer {
  param([System.Windows.Automation.AutomationElement]$Editor)

  $state = Get-EditorTextState $Editor
  if (-not $state.available) {
    return [PSCustomObject]@{ available = $false; matches = $false }
  }

  return [PSCustomObject]@{
    available = $true
    matches = (Get-TextHash $state.text) -eq $ExpectedMessageHash.ToLowerInvariant()
  }
}

function Invoke-SendElement {
  param(
    [System.Windows.Automation.AutomationElement]$Element,
    [IntPtr]$WindowHandle
  )

  if (-not (Test-ActionableElement $Element)) {
    return $null
  }

  try {
    $pattern = $null
    if ($Element.TryGetCurrentPattern(
      [System.Windows.Automation.InvokePattern]::Pattern,
      [ref]$pattern
    )) {
      ([System.Windows.Automation.InvokePattern]$pattern).Invoke()
      return 'uia-invoke'
    }
  }
  catch {
    # Continue to accessible/default click fallbacks.
  }

  try {
    $legacyPattern = $null
    if ($Element.TryGetCurrentPattern(
      [System.Windows.Automation.LegacyIAccessiblePattern]::Pattern,
      [ref]$legacyPattern
    )) {
      ([System.Windows.Automation.LegacyIAccessiblePattern]$legacyPattern).DoDefaultAction()
      return 'uia-default-action'
    }
  }
  catch {
    # Continue to a UIA-derived clickable point.
  }

  try {
    if ([GhostDesktopWindowApi]::GetForegroundWindow() -ne $WindowHandle) {
      return $null
    }

    $point = New-Object System.Windows.Point
    if ($Element.TryGetClickablePoint([ref]$point)) {
      $cursorMoved = [GhostDesktopWindowApi]::SetCursorPos(
        [int][Math]::Round($point.X),
        [int][Math]::Round($point.Y)
      )
      if (-not $cursorMoved -or [GhostDesktopWindowApi]::GetForegroundWindow() -ne $WindowHandle) {
        return $null
      }
      Start-Sleep -Milliseconds 80
      [GhostDesktopWindowApi]::mouse_event($MouseLeftDown, 0, 0, 0, [UIntPtr]::Zero)
      [GhostDesktopWindowApi]::mouse_event($MouseLeftUp, 0, 0, 0, [UIntPtr]::Zero)
      return 'uia-clickable-point'
    }
  }
  catch {
    return $null
  }

  return $null
}

function Send-FocusedEnter {
  param(
    [System.Windows.Automation.AutomationElement]$Editor,
    [IntPtr]$WindowHandle
  )

  if (-not $Editor -or [GhostDesktopWindowApi]::GetForegroundWindow() -ne $WindowHandle) {
    return $false
  }

  try {
    $Editor.SetFocus()
    Start-Sleep -Milliseconds 180
    if (
      -not $Editor.Current.HasKeyboardFocus -or
      [GhostDesktopWindowApi]::GetForegroundWindow() -ne $WindowHandle
    ) {
      return $false
    }
    $keyboard = New-Object -ComObject WScript.Shell
    $keyboard.SendKeys('{ENTER}')
    return $true
  }
  catch {
    return $false
  }
}

function Confirm-ComposerChanged {
  param(
    [IntPtr]$WindowHandle,
    [int]$WaitMilliseconds = 2500
  )

  $confirmationDeadline = [DateTime]::UtcNow.AddMilliseconds($WaitMilliseconds)
  while ([DateTime]::UtcNow -lt $confirmationDeadline) {
    try {
      $root = [System.Windows.Automation.AutomationElement]::FromHandle($WindowHandle)
      $editor = Find-MessageEditor $root
      $state = Get-EditorTextState $editor
      if ($state.available -and (Get-TextHash $state.text) -ne $ExpectedMessageHash.ToLowerInvariant()) {
        return $true
      }
    }
    catch {}
    Start-Sleep -Milliseconds 150
  }

  return $false
}

# Avoid acting on a stale Send button while the compose deep link starts loading.
Start-Sleep -Milliseconds 900

$lastWindowTitle = ''
$sawWindow = $false
$sawFocusedWindow = $false
$sawSendButton = $false
$sawEditor = $false
$sawComposerMismatch = $false
$sawEnterFailure = $false

while ([DateTime]::UtcNow -lt $deadline) {
  try {
    $target = Get-WhatsAppWindow
  }
  catch {
    Start-Sleep -Milliseconds 250
    continue
  }
  if (-not $target) {
    Start-Sleep -Milliseconds 250
    continue
  }

  $sawWindow = $true
  try {
    $lastWindowTitle = $target.MainWindowTitle
    $handle = [IntPtr]$target.MainWindowHandle
    if (-not (Focus-WhatsAppWindow $target $handle)) {
      Start-Sleep -Milliseconds 250
      continue
    }
    $sawFocusedWindow = $true

    $root = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
    if (-not $root) {
      Start-Sleep -Milliseconds 250
      continue
    }

    $editor = Find-MessageEditor $root
    $sendButton = Find-SendButton $root
    if ($editor) { $sawEditor = $true }
    if ($sendButton) { $sawSendButton = $true }

    $composer = Test-ExpectedComposer $editor
    if ($composer.available -and -not $composer.matches) {
      $sawComposerMismatch = $true
      Start-Sleep -Milliseconds 250
      continue
    }

    $composerReady = $composer.matches -or (
      $editor -and
      -not $composer.available -and
      [DateTime]::UtcNow -ge $unverifiedActionAt
    )
    if (-not $composerReady) {
      Start-Sleep -Milliseconds 250
      continue
    }

    if ($sendButton) {
      $method = Invoke-SendElement $sendButton $handle
      if ($method) {
        if ($composer.matches -and -not (Confirm-ComposerChanged $handle)) {
          Write-GhostResult $false 'send-unconfirmed' "Invoked the WhatsApp Send button in '$lastWindowTitle', but the composer did not clear." 5
        }
        Write-GhostResult $true $method "Invoked the WhatsApp Send button in '$lastWindowTitle'." 0
      }
    }

    # Wait for the actual Send control first. Enter is a late fallback and is
    # used only after the real composer has been located and focused.
    if ([DateTime]::UtcNow -ge $enterFallbackAt) {
      if (Send-FocusedEnter $editor $handle) {
        if ($composer.matches -and -not (Confirm-ComposerChanged $handle)) {
          Write-GhostResult $false 'send-unconfirmed' "Focused the WhatsApp composer and issued Enter in '$lastWindowTitle', but the composer did not clear." 5
        }
        Write-GhostResult $true 'focused-enter' "Focused the WhatsApp composer and issued Enter in '$lastWindowTitle'." 0
      }
      $sawEnterFailure = $true
    }
  }
  catch {
    # The accessibility tree can rebuild while WhatsApp loads. Poll again.
  }

  Start-Sleep -Milliseconds 250
}

if (-not $sawWindow) {
  Write-GhostResult $false 'window-not-found' 'No unlocked WhatsApp window became available before the timeout.' 2
}
if (-not $sawFocusedWindow) {
  Write-GhostResult $false 'focus-failed' "WhatsApp opened, but Ghost could not foreground '$lastWindowTitle'. Keep Ghost and WhatsApp at the same privilege level." 3
}
if ($sawComposerMismatch) {
  Write-GhostResult $false 'composer-mismatch' "WhatsApp opened, but the intended pre-filled message never appeared in the composer for '$lastWindowTitle'." 4
}
if ($sawSendButton -and -not $sawEditor) {
  Write-GhostResult $false 'composer-not-found' "WhatsApp exposed a Send control, but Ghost could not identify the message composer in '$lastWindowTitle'." 4
}
if ($sawEditor -and -not $sawSendButton) {
  Write-GhostResult $false 'send-button-not-found' "Ghost found the WhatsApp composer, but no actionable Send button appeared in '$lastWindowTitle'." 4
}
if ($sawEnterFailure) {
  Write-GhostResult $false 'composer-focus-failed' "Ghost found the WhatsApp composer but could not safely focus it for the Enter fallback in '$lastWindowTitle'." 4
}

Write-GhostResult $false 'controls-not-found' "WhatsApp opened, but its Send controls were not actionable in '$lastWindowTitle'." 4
