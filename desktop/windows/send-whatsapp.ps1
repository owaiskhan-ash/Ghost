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
$verifiedCoordinateFallbackAt = $startedAt.AddMilliseconds(600)
$unverifiedActionAt = $startedAt.AddMilliseconds(1600)
$unverifiedCoordinateFallbackAt = $startedAt.AddMilliseconds(1900)
$enterFallbackAt = $startedAt.AddMilliseconds([Math]::Min(9000, $TimeoutSeconds * 600))
$pollMilliseconds = 75
$sendNamePattern = '^(send|send message|enviar|envoyer|senden|invia|invia messaggio|kirim)(\s*\(.*\))?$'
$messageNamePattern = '^(type a message|message|write a message|enter a message)$'

function Write-GhostResult {
  param(
    [bool]$Ok,
    [string]$Method,
    [string]$Detail,
    [int]$ExitCode,
    [bool]$Confirmed = $false
  )

  [ordered]@{
    ok = $Ok
    method = $Method
    detail = $Detail
    confirmed = $Confirmed
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

  if ([GhostDesktopWindowApi]::GetForegroundWindow() -eq $Handle) {
    return $true
  }

  [void][GhostDesktopWindowApi]::ShowWindowAsync($Handle, $RestoreWindow)
  Start-Sleep -Milliseconds 35
  [void][GhostDesktopWindowApi]::SetForegroundWindow($Handle)
  Start-Sleep -Milliseconds 40

  if ([GhostDesktopWindowApi]::GetForegroundWindow() -ne $Handle) {
    try {
      $keyboard = New-Object -ComObject WScript.Shell
      [void]$keyboard.AppActivate($Target.Id)
      Start-Sleep -Milliseconds 60
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

function Test-SendElement {
  param([System.Windows.Automation.AutomationElement]$Element)

  if (-not (Test-ActionableElement $Element)) {
    return $false
  }

  try {
    $name = "$(($Element.Current.Name))".Trim()
    $automationId = "$(($Element.Current.AutomationId))".Trim()
    return (
      $name -match "(?i)$sendNamePattern" -or
      $automationId -match '(?i)(^|[-_])(send|sendbutton|send-message)([-_]|$)'
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
  $customCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Custom
  )
  $candidateCondition = [System.Windows.Automation.OrCondition]::new(
    [System.Windows.Automation.Condition[]]@(
      $buttonCondition,
      $customCondition
    )
  )

  $candidates = $Root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    $candidateCondition
  )

  for ($index = 0; $index -lt $candidates.Count; $index += 1) {
    $candidate = $candidates.Item($index)
    if (Test-SendElement $candidate) {
      return $candidate
    }
  }

  # Chromium can expose the icon label as a Text child instead of a Button.
  $sendNameCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::NameProperty,
    'Send',
    [System.Windows.Automation.PropertyConditionFlags]::IgnoreCase
  )
  $namedElement = $Root.FindFirst(
    [System.Windows.Automation.TreeScope]::Descendants,
    $sendNameCondition
  )
  if (Test-ActionableElement $namedElement) {
    return $namedElement
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
  $customControlCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Custom
  )
  $editCondition = [System.Windows.Automation.OrCondition]::new(
    [System.Windows.Automation.Condition[]]@(
      $editControlCondition,
      $documentControlCondition,
      $customControlCondition
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
      $isNamedComposer = $label -match "(?i)$messageNamePattern" -or $label -match '(?i)(composer|message-input)'
      $isInComposerRegion = $rootThreshold -eq 0 -or $rectangle.Top -gt $rootThreshold
      if ($isNamedComposer -and ($rootThreshold -eq 0 -or $rectangle.Bottom -gt $rootThreshold)) {
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

function Find-SendElementFromPoint {
  param(
    [System.Windows.Automation.AutomationElement]$Root,
    [System.Windows.Automation.AutomationElement]$Editor
  )

  try {
    $rootRectangle = $Root.Current.BoundingRectangle
    $points = New-Object System.Collections.Generic.List[System.Windows.Point]

    if ($Editor) {
      $editorRectangle = $Editor.Current.BoundingRectangle
      $centerY = $editorRectangle.Top + ($editorRectangle.Height / 2)
      foreach ($offset in @(22, 32, 44, 56)) {
        $points.Add([System.Windows.Point]::new($editorRectangle.Right + $offset, $centerY))
      }
    }

    foreach ($xOffset in @(26, 38, 50, 62)) {
      foreach ($yOffset in @(26, 38, 50, 62)) {
        $points.Add([System.Windows.Point]::new(
          $rootRectangle.Right - $xOffset,
          $rootRectangle.Bottom - $yOffset
        ))
      }
    }

    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    foreach ($point in $points) {
      if (
        $point.X -le $rootRectangle.Left -or
        $point.X -ge $rootRectangle.Right -or
        $point.Y -le $rootRectangle.Top -or
        $point.Y -ge $rootRectangle.Bottom
      ) {
        continue
      }

      $element = [System.Windows.Automation.AutomationElement]::FromPoint($point)
      for ($depth = 0; $depth -lt 6 -and $element; $depth += 1) {
        if (Test-SendElement $element) {
          return $element
        }
        $element = $walker.GetParent($element)
      }
    }
  }
  catch {}

  return $null
}

function Click-ComposerAdjacentSendPoint {
  param(
    [System.Windows.Automation.AutomationElement]$Root,
    [System.Windows.Automation.AutomationElement]$Editor,
    [IntPtr]$WindowHandle
  )

  if ([GhostDesktopWindowApi]::GetForegroundWindow() -ne $WindowHandle) {
    return $false
  }

  try {
    $rootRectangle = $Root.Current.BoundingRectangle
    if ($Editor) {
      $editorRectangle = $Editor.Current.BoundingRectangle
      $x = [Math]::Min($rootRectangle.Right - 24, $editorRectangle.Right + 34)
      $y = $editorRectangle.Top + ($editorRectangle.Height / 2)
    }
    else {
      # WhatsApp swaps the bottom-right voice control for Send when text exists.
      $x = $rootRectangle.Right - 38
      $y = $rootRectangle.Bottom - 38
    }

    if (
      $x -le $rootRectangle.Left + ($rootRectangle.Width * 0.55) -or
      $x -ge $rootRectangle.Right -or
      $y -le $rootRectangle.Top + ($rootRectangle.Height * 0.55) -or
      $y -ge $rootRectangle.Bottom
    ) {
      return $false
    }

    $cursorMoved = [GhostDesktopWindowApi]::SetCursorPos(
      [int][Math]::Round($x),
      [int][Math]::Round($y)
    )
    if (-not $cursorMoved -or [GhostDesktopWindowApi]::GetForegroundWindow() -ne $WindowHandle) {
      return $false
    }

    Start-Sleep -Milliseconds 40
    [GhostDesktopWindowApi]::mouse_event($MouseLeftDown, 0, 0, 0, [UIntPtr]::Zero)
    [GhostDesktopWindowApi]::mouse_event($MouseLeftUp, 0, 0, 0, [UIntPtr]::Zero)
    return $true
  }
  catch {
    return $false
  }
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
      Start-Sleep -Milliseconds 40
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
    Start-Sleep -Milliseconds 60
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
    [int]$WaitMilliseconds = 1400
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
    Start-Sleep -Milliseconds 50
  }

  return $false
}

# Keep a short route-handoff guard because consecutive bulk recipients can use
# identical message text; the hash alone cannot distinguish those two chats.
Start-Sleep -Milliseconds 350

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
    Start-Sleep -Milliseconds $pollMilliseconds
    continue
  }
  if (-not $target) {
    Start-Sleep -Milliseconds $pollMilliseconds
    continue
  }

  $sawWindow = $true
  try {
    $lastWindowTitle = $target.MainWindowTitle
    $handle = [IntPtr]$target.MainWindowHandle
    if (-not (Focus-WhatsAppWindow $target $handle)) {
      Start-Sleep -Milliseconds $pollMilliseconds
      continue
    }
    $sawFocusedWindow = $true

    $root = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
    if (-not $root) {
      Start-Sleep -Milliseconds $pollMilliseconds
      continue
    }

    $editor = Find-MessageEditor $root
    $sendButton = Find-SendButton $root
    if (-not $sendButton) {
      $sendButton = Find-SendElementFromPoint $root $editor
    }
    if ($editor) { $sawEditor = $true }
    if ($sendButton) { $sawSendButton = $true }

    $composer = Test-ExpectedComposer $editor
    if ($composer.available -and -not $composer.matches) {
      $sawComposerMismatch = $true
      Start-Sleep -Milliseconds $pollMilliseconds
      continue
    }

    $composerReady = $composer.matches -or (
      -not $composer.available -and
      [DateTime]::UtcNow -ge $unverifiedActionAt
    )
    if (-not $composerReady) {
      Start-Sleep -Milliseconds $pollMilliseconds
      continue
    }

    if ($sendButton) {
      $method = Invoke-SendElement $sendButton $handle
      if ($method) {
        $sendConfirmed = $false
        if ($composer.matches) {
          if (-not (Confirm-ComposerChanged $handle)) {
            Write-GhostResult $false 'send-unconfirmed' "Invoked the WhatsApp Send button in '$lastWindowTitle', but the composer did not clear." 5
          }
          $sendConfirmed = $true
        }
        Write-GhostResult $true $method "Invoked the WhatsApp Send button in '$lastWindowTitle'." 0 $sendConfirmed
      }
    }

    # Some WhatsApp Desktop builds expose the window but hide the footer controls
    # from UI Automation. Click the expected Send point beside the verified
    # composer (or the settled bottom-right Send slot) before trying a key.
    $coordinateFallbackDue = (
      $composer.matches -and
      [DateTime]::UtcNow -ge $verifiedCoordinateFallbackAt
    ) -or (
      -not $composer.available -and
      [DateTime]::UtcNow -ge $unverifiedCoordinateFallbackAt
    )
    if ($coordinateFallbackDue) {
      if (Click-ComposerAdjacentSendPoint $root $editor $handle) {
        $sendConfirmed = $false
        if ($composer.matches) {
          if (-not (Confirm-ComposerChanged $handle)) {
            Write-GhostResult $false 'send-unconfirmed' "Clicked the WhatsApp Send position in '$lastWindowTitle', but the composer did not clear." 5
          }
          $sendConfirmed = $true
        }
        Write-GhostResult $true 'composer-adjacent-click' "Clicked the WhatsApp Send position in '$lastWindowTitle'." 0 $sendConfirmed
      }
    }

    # Wait for the actual Send control first. Enter is a late fallback and is
    # used only after the real composer has been located and focused.
    if ([DateTime]::UtcNow -ge $enterFallbackAt) {
      if (Send-FocusedEnter $editor $handle) {
        $sendConfirmed = $false
        if ($composer.matches) {
          if (-not (Confirm-ComposerChanged $handle)) {
            Write-GhostResult $false 'send-unconfirmed' "Focused the WhatsApp composer and issued Enter in '$lastWindowTitle', but the composer did not clear." 5
          }
          $sendConfirmed = $true
        }
        Write-GhostResult $true 'focused-enter' "Focused the WhatsApp composer and issued Enter in '$lastWindowTitle'." 0 $sendConfirmed
      }
      $sawEnterFailure = $true
    }
  }
  catch {
    # The accessibility tree can rebuild while WhatsApp loads. Poll again.
  }

  Start-Sleep -Milliseconds $pollMilliseconds
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
