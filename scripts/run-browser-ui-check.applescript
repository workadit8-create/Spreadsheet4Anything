#!/usr/bin/env osascript
-- Jalankan browser UI check di tab Chrome yang sudah login GAS
set scriptPath to POSIX path of (path to me)
set repoRoot to do shell script "dirname $(dirname " & quoted form of scriptPath & ")"
set jsFile to repoRoot & "/scripts/browser-ui-check-console.js"
set js to do shell script "cat " & quoted form of jsFile

tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      set u to URL of t
      if u contains "script.google.com/macros" then
        set res to execute t javascript js
        return res
      end if
    end repeat
  end repeat
  return "ERROR: Tab script.google.com/macros tidak ditemukan di Chrome. Buka URL production di Chrome atau paste script manual di DevTools."
end tell
