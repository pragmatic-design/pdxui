# Who holds a test's project on Windows, without administrator rights (#923). Called by remove-tree.ts.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File holders.ps1 <root> [<file> ...]
#
# Prints one line per holder, tab-separated: `<pid> <name> cwd <directory>` for each process of this user
# whose working directory is inside <root>, and `<pid> <name> file <file>` for each process that has one
# of the given files open.
#
# Two sources, because each answers one question and neither answers both:
# - A directory refuses a rename on Windows when it is a process's working directory. No API names the
#   processes sitting in a directory, so the working directory of every process is read from its PEB
#   (RTL_USER_PROCESS_PARAMETERS.CurrentDirectory), which a process of the same user may read.
# - A file refuses a rename when something has it open without sharing. The Restart Manager names those
#   processes. It refuses a directory (error 5), which is why the PEB is read for those.
# Sysinternals Handle answers both, but needs administrator rights, and the pre-push is not elevated.
# A process that cannot be opened (another user's, a protected one) or is 32-bit is skipped.

# Single-quoted, so PowerShell expands nothing in the C# below: no `$` or backtick escapes.
$source = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class PdxHolders {
    [StructLayout(LayoutKind.Sequential)]
    struct ProcessBasicInformation { public IntPtr Reserved1; public IntPtr PebBaseAddress; public IntPtr Reserved2a; public IntPtr Reserved2b; public IntPtr UniqueProcessId; public IntPtr Reserved3; }

    [StructLayout(LayoutKind.Sequential)]
    struct RmUniqueProcess { public int ProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME StartTime; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct RmProcessInfo {
        public RmUniqueProcess Process;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string AppName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string ServiceShortName;
        public int ApplicationType; public uint AppStatus; public uint TSSessionId;
        [MarshalAs(UnmanagedType.Bool)] public bool Restartable;
    }

    const int PROCESS_QUERY_INFORMATION = 0x0400;
    const int PROCESS_VM_READ = 0x0010;
    const int ERROR_MORE_DATA = 234;
    // x64 layout: PEB.ProcessParameters, and RTL_USER_PROCESS_PARAMETERS.CurrentDirectory.DosPath.
    const int PEB_PROCESS_PARAMETERS = 0x20;
    const int PARAMETERS_CURRENT_DIRECTORY = 0x38;

    [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr process, int infoClass, ref ProcessBasicInformation info, int length, out int returned);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int access, bool inherit, int pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern bool IsWow64Process(IntPtr process, out bool wow64);
    [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] buffer, int size, out IntPtr read);
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmStartSession(out uint session, int flags, string key);
    [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint session);
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmRegisterResources(uint session, uint files, string[] names, uint processes, RmUniqueProcess[] list, uint services, string[] serviceNames);
    [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint session, out uint needed, ref uint count, [In, Out] RmProcessInfo[] info, ref uint reasons);

    static byte[] Read(IntPtr process, IntPtr address, int size) {
        var buffer = new byte[size];
        IntPtr read;
        return ReadProcessMemory(process, address, buffer, size, out read) ? buffer : null;
    }

    /// The working directory of a process, or null when it cannot be read.
    static string WorkingDirectory(int pid) {
        IntPtr process = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid);
        if (process == IntPtr.Zero) return null;
        try {
            bool wow64;
            if (IsWow64Process(process, out wow64) && wow64) return null;
            var info = new ProcessBasicInformation();
            int returned;
            if (NtQueryInformationProcess(process, 0, ref info, Marshal.SizeOf(info), out returned) != 0) return null;
            byte[] parameters = Read(process, info.PebBaseAddress + PEB_PROCESS_PARAMETERS, 8);
            if (parameters == null) return null;
            byte[] dosPath = Read(process, (IntPtr)BitConverter.ToInt64(parameters, 0) + PARAMETERS_CURRENT_DIRECTORY, 16);
            if (dosPath == null) return null;
            int length = BitConverter.ToUInt16(dosPath, 0);
            byte[] text = Read(process, (IntPtr)BitConverter.ToInt64(dosPath, 8), length);
            return text == null ? null : Encoding.Unicode.GetString(text);
        } finally {
            CloseHandle(process);
        }
    }

    /// A process's name, or null when it exited between the listing and this read.
    static string NameOf(Process process) {
        try { return process.ProcessName; }
        catch (InvalidOperationException) { return null; }
    }

    /// The image name of a process, as the working-directory lines give it; null when it has exited, and
    /// the Restart Manager's own name for it is used instead.
    static string NameById(int pid) {
        try { using (Process process = Process.GetProcessById(pid)) return NameOf(process); }
        catch (ArgumentException) { return null; }
    }

    public static List<string> InDirectory(string root) {
        // The PEB holds the directory with backslashes and a trailing one; `root` may have either slash.
        string prefix = root.Replace('/', '\\').TrimEnd('\\') + "\\";
        var lines = new List<string>();
        foreach (Process process in Process.GetProcesses()) {
            using (process) {
                string cwd = WorkingDirectory(process.Id);
                if (cwd == null || !(cwd.TrimEnd('\\') + "\\").StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) continue;
                string name = NameOf(process);
                if (name != null) lines.Add(process.Id + "\t" + name + "\tcwd\t" + cwd);
            }
        }
        return lines;
    }

    public static List<string> HoldingFile(string file) {
        var lines = new List<string>();
        uint session;
        if (RmStartSession(out session, 0, Guid.NewGuid().ToString()) != 0) return lines;
        try {
            if (RmRegisterResources(session, 1, new[] { file }, 0, null, 0, null) != 0) return lines;
            uint needed, count = 0, reasons = 0;
            int status = RmGetList(session, out needed, ref count, null, ref reasons);
            if (status != ERROR_MORE_DATA) return lines;
            var info = new RmProcessInfo[needed];
            count = needed;
            if (RmGetList(session, out needed, ref count, info, ref reasons) != 0) return lines;
            for (int i = 0; i < count; i++) {
                int pid = info[i].Process.ProcessId;
                lines.Add(pid + "\t" + (NameById(pid) ?? info[i].AppName) + "\tfile\t" + file);
            }
        } finally {
            RmEndSession(session);
        }
        return lines;
    }
}
'@

Add-Type -TypeDefinition $source
$root = $args[0]
foreach ($line in [PdxHolders]::InDirectory($root)) { $line }
foreach ($file in ($args | Select-Object -Skip 1)) {
    foreach ($line in [PdxHolders]::HoldingFile($file)) { $line }
}
