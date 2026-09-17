<#
.SYNOPSIS
  C-10 -- put bb2dash in front of Stack: a Desktop shortcut and a Start Menu
  shortcut that carries the AppUserModelID Windows needs before it will show a
  toast.

.DESCRIPTION
  There is no installer in this phase (C-10: unpacked build, no signing, no
  auto-update), so the two things an installer would normally do are done here.

  * Desktop\bb2dash.lnk         -- the double-click Stack's acceptance script
                                  step 1 uses.
  * Start Menu\Programs\bb2dash.lnk
                                -- the same target, plus the shell property
                                  `System.AppUserModel.ID = su.stack.bb2dash`.

  Why the Start Menu one needs that property: Electron's own notification
  documentation says "for notifications on Windows, your Electron app needs to
  have a Start Menu shortcut with an AppUserModelID". Squirrel/NSIS installers
  write it; an unpacked build has nobody to write it, and without a matching
  shortcut Windows drops `new Notification(...)` silently -- no error, no toast.
  `app.setAppUserModelId('su.stack.bb2dash')` in the main process (C-3) is only
  half of the pair; this shortcut is the other half.

  A ToastActivatorCLSID is deliberately *not* set: that is only needed for toast
  action buttons, and Q6 made the MVP's toasts click-only.

  WScript.Shell can write a .lnk but cannot touch its property store, so the
  Start Menu shortcut is built through IShellLink + IPropertyStore directly.

.PARAMETER ExePath
  The packed executable. Defaults to ..\dist\win-unpacked\bb2dash.exe relative
  to this script, which is where `npm run pack` puts it.

.PARAMETER DesktopDir
  Where the Desktop shortcut goes. Defaults to the real Desktop; point it
  somewhere else to rehearse without touching it.

.PARAMETER StartMenuDir
  Where the Start Menu shortcut goes. Defaults to the per-user
  Start Menu\Programs folder.

.PARAMETER Name
  Base name of both shortcuts. Default "bb2dash".

.EXAMPLE
  .\make-shortcut.ps1 -WhatIf
  Prints both shortcuts it would write and changes nothing.

.EXAMPLE
  .\make-shortcut.ps1
  Writes both shortcuts. Sign out and back in (or restart Explorer) if the
  Start Menu does not pick the new entry up immediately.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$ExePath,
  [string]$DesktopDir = [Environment]::GetFolderPath('Desktop'),
  [string]$StartMenuDir = (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'),
  [string]$Name = 'bb2dash'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# The AppUserModelID is the same literal as APP_USER_MODEL_ID in
# src/main/index.ts and appId in electron-builder.yml. All three must agree or
# toasts stop arriving; there is no way to assert that from a .ps1, so it is
# called out here instead.
$AppUserModelId = 'su.stack.bb2dash'

function Resolve-PackedExe {
  param([string]$Candidate)

  if ($Candidate) {
    if (-not (Test-Path -LiteralPath $Candidate -PathType Leaf)) {
      throw "No executable at $Candidate."
    }
    return (Resolve-Path -LiteralPath $Candidate).Path
  }

  $default = Join-Path $PSScriptRoot '..\dist\win-unpacked\bb2dash.exe'
  if (-not (Test-Path -LiteralPath $default -PathType Leaf)) {
    throw @"
No packed build at $default.
Build one first:
    cd desktop
    npm ci
    npm run pack
"@
  }
  return (Resolve-Path -LiteralPath $default).Path
}

# --- IShellLink + IPropertyStore -------------------------------------------
# Loaded once per session; Add-Type throws if the type is already defined.
if (-not ('Bb2dash.ShortcutWriter' -as [type])) {
  Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

namespace Bb2dash {
  [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
  internal class CShellLink { }

  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown),
   Guid("000214F9-0000-0000-C000-000000000046")]
  internal interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder f, int cch, IntPtr fd, uint flags);
    void GetIDList(out IntPtr ppidl);
    void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder name, int cch);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder dir, int cch);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string dir);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder args, int cch);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string args);
    void GetHotkey(out short hotkey);
    void SetHotkey(short hotkey);
    void GetShowCmd(out int showCmd);
    void SetShowCmd(int showCmd);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int cch, out int icon);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path, int icon);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pathRel, uint reserved);
    void Resolve(IntPtr hwnd, uint flags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string file);
  }

  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown),
   Guid("0000010b-0000-0000-C000-000000000046")]
  internal interface IPersistFile {
    void GetClassID(out Guid classId);
    [PreserveSig] int IsDirty();
    void Load([MarshalAs(UnmanagedType.LPWStr)] string file, uint mode);
    void Save([MarshalAs(UnmanagedType.LPWStr)] string file, [MarshalAs(UnmanagedType.Bool)] bool remember);
    void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string file);
    void GetCurFile([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder file);
  }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  internal struct PropertyKey {
    public Guid FormatId;
    public uint PropertyId;
    public PropertyKey(Guid formatId, uint propertyId) {
      FormatId = formatId; PropertyId = propertyId;
    }
  }

  /// <summary>
  /// PROPVARIANT, laid out as the header (four 16-bit fields) followed by the
  /// union. Only VT_LPWSTR is used here, and for that the union is a single
  /// pointer, so two IntPtr fields cover the whole 24-byte (x64) structure
  /// with the pointer landing at the right offset on x86 too.
  /// </summary>
  [StructLayout(LayoutKind.Sequential)]
  internal struct PropVariant {
    public ushort VarType;
    public ushort Reserved1;
    public ushort Reserved2;
    public ushort Reserved3;
    public IntPtr Pointer;
    public IntPtr PointerHigh;
  }

  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown),
   Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99")]
  internal interface IPropertyStore {
    void GetCount(out uint count);
    void GetAt(uint index, out PropertyKey key);
    void GetValue(ref PropertyKey key, out PropVariant value);
    void SetValue(ref PropertyKey key, ref PropVariant value);
    void Commit();
  }

  public static class ShortcutWriter {
    // System.AppUserModel.ID
    static readonly Guid AppUserModelIdFormat =
      new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
    const uint AppUserModelIdProperty = 5;
    const ushort VT_LPWSTR = 31;

    // propsys.dll's InitPropVariantFromString is an inline helper in
    // propvarutil.h, not an exported entry point, so the PROPVARIANT is filled
    // by hand: VT_LPWSTR plus a CoTaskMem string, which is exactly what
    // PropVariantClear knows how to free again.
    [DllImport("ole32.dll", PreserveSig = false)]
    static extern void PropVariantClear(ref PropVariant variant);

    static PropVariant StringVariant(string value) {
      PropVariant variant = new PropVariant();
      variant.VarType = VT_LPWSTR;
      variant.Pointer = Marshal.StringToCoTaskMemUni(value);
      return variant;
    }

    /// <summary>
    /// Write a .lnk. When appUserModelId is non-null it is stored in the
    /// shortcut's property store, which is what Windows looks at before it
    /// decides whether an unpackaged app may raise a toast.
    /// </summary>
    public static void Write(
      string linkPath, string target, string workingDirectory,
      string description, string iconPath, string appUserModelId) {

      IShellLinkW link = (IShellLinkW)new CShellLink();
      try {
        link.SetPath(target);
        link.SetWorkingDirectory(workingDirectory);
        link.SetDescription(description);
        link.SetIconLocation(iconPath, 0);
        link.SetShowCmd(1); // SW_SHOWNORMAL

        if (appUserModelId != null) {
          IPropertyStore store = (IPropertyStore)link;
          PropertyKey key = new PropertyKey(AppUserModelIdFormat, AppUserModelIdProperty);
          PropVariant value = StringVariant(appUserModelId);
          try {
            store.SetValue(ref key, ref value);
            store.Commit();
          } finally {
            PropVariantClear(ref value);
          }
        }

        ((IPersistFile)link).Save(linkPath, true);
      } finally {
        Marshal.ReleaseComObject(link);
      }
    }

    /// <summary>Read back System.AppUserModel.ID, for verification.</summary>
    public static string ReadAppUserModelId(string linkPath) {
      IShellLinkW link = (IShellLinkW)new CShellLink();
      try {
        ((IPersistFile)link).Load(linkPath, 0);
        IPropertyStore store = (IPropertyStore)link;
        uint count;
        store.GetCount(out count);
        for (uint i = 0; i < count; i++) {
          PropertyKey key;
          store.GetAt(i, out key);
          if (key.FormatId == AppUserModelIdFormat && key.PropertyId == AppUserModelIdProperty) {
            PropVariant value;
            store.GetValue(ref key, out value);
            try {
              if (value.VarType != VT_LPWSTR) return null;
              return Marshal.PtrToStringUni(value.Pointer);
            } finally {
              PropVariantClear(ref value);
            }
          }
        }
        return null;
      } finally {
        Marshal.ReleaseComObject(link);
      }
    }
  }
}
'@
}

# --- do it ------------------------------------------------------------------
$exe = Resolve-PackedExe -Candidate $ExePath
$workingDirectory = Split-Path -Parent $exe
$description = 'bb2dash -- Blackboard, assignments, grades and readings in one window.'

$targets = @(
  [pscustomobject]@{
    Kind          = 'Desktop'
    Directory     = $DesktopDir
    # Only the Start Menu copy is what Windows consults before allowing a toast,
    # but the same property on the Desktop copy costs nothing and keeps the
    # taskbar button grouped under one identity whichever shortcut was used.
    AppUserModelId = $AppUserModelId
  },
  [pscustomobject]@{
    Kind          = 'Start Menu'
    Directory     = $StartMenuDir
    AppUserModelId = $AppUserModelId
  }
)

Write-Output "target      : $exe"
Write-Output "working dir : $workingDirectory"
Write-Output ''

foreach ($target in $targets) {
  $linkPath = Join-Path $target.Directory "$Name.lnk"
  $aumidNote = if ($target.AppUserModelId) {
    "System.AppUserModel.ID = $($target.AppUserModelId)"
  } else {
    'no AppUserModelID'
  }

  if (-not (Test-Path -LiteralPath $target.Directory -PathType Container)) {
    if ($PSCmdlet.ShouldProcess($target.Directory, 'create directory')) {
      New-Item -ItemType Directory -Force -Path $target.Directory | Out-Null
    }
  }

  if ($PSCmdlet.ShouldProcess($linkPath, "write $($target.Kind) shortcut ($aumidNote)")) {
    [Bb2dash.ShortcutWriter]::Write(
      $linkPath, $exe, $workingDirectory, $description, $exe, $target.AppUserModelId)

    $readBack = [Bb2dash.ShortcutWriter]::ReadAppUserModelId($linkPath)
    $state = if ($readBack) { "AppUserModelID = $readBack" } else { 'no AppUserModelID' }
    Write-Output "wrote $($target.Kind.PadRight(10)) $linkPath  ($state)"
  } else {
    Write-Output "would write $($target.Kind.PadRight(10)) $linkPath  ($aumidNote)"
  }
}

Write-Output ''
Write-Output 'Done. First launch may show SmartScreen ("Windows protected your PC"):'
Write-Output '  More info -> Run anyway. The build is unsigned on purpose (C-10).'
