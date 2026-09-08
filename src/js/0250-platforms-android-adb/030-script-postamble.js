    function scriptPostamble(ctx) {
      // VER-5: each command calls only its own summary. This used to call both and rely on
      // each self-suppressing on an empty result list, which worked but meant every script
      // carried the other command's reporting code as well.
      return ['', '# --- End ---',
        (ctx.command === 'verification' ? 'Write-VerificationSummary' : 'Write-ImplementationSummary'),
        'Stop-Transcript | Out-Null',
        'exit $script:RunExit'].join('\n');
    }

    /**
     * A "how to run" comment block prepended to each generated script (review-9 #4).
     * Includes the exact command for THIS file's emitted name.
     * @param {string} name  the emitted filename (e.g. "packages.impl.ps1")
     */
    function runInstructions(name) {
      var isTxt = /\.txt$/.test(name);
      return [
        '# =============================================================',
        '# HOW TO RUN THIS SCRIPT (Windows + ADB / platform-tools)',
        '#   1. Enable USB debugging on the device and connect it by USB.',
        '#   2. In File Explorer, open the folder that contains adb.exe',
        '#      (the Android platform-tools folder); put this file there.',
        '#   3. Click the File Explorer address bar, type  cmd  and press',
        '#      Enter — a Command Prompt opens in that folder.',
        '#   4. Run this file with:',
        '#        powershell -ExecutionPolicy Bypass -File .\\' + name,
        (isTxt ? '#      (This file has a .txt extension — rename it to .ps1 first.)' : '#'),
        '#',
        '#   ALTERNATIVELY, if you paste the script CONTENTS into a PowerShell',
        '#   window: PowerShell will not find adb.exe in the current folder the way',
        '#   cmd does. Before pasting, add the platform-tools folder to PATH for the',
        '#   session (see the "ADB on PATH" note in the script body), e.g.:',
        '#        $env:PATH += ";$PWD"     # when PowerShell is open in that folder',
        '# =============================================================',
        ''
      ].join('\n');
    }

    var captureInstructions =
      'Capture two files from the target device (the tool never contacts a device):\n' +
      '  1. Packages (packages.txt): adb -s <serial> shell pm list packages\n' +
      '       (one "package:<name>" per line)\n' +
      '  2. Tactical (policy json): export the device tactical/policy configuration as a JSON object\n' +
      'Custom Security Actions need no capture — they are written in the tool and apply to every device.';

    App.platforms = App.platforms || {};
    App.platforms.androidAdb = {
      id: 'android-adb',
      label: 'Android (ADB)',
      outputLanguage: 'powershell',
      scriptExtension: '.ps1',   // generator wraps these files with preamble/postamble
      // CUS-1: Custom Actions sits AFTER the two captured registers — the workflow is
      // decide what the capture showed you, then record what the capture could not.
      datasets: [A.packages, A.tactical, A.custom],
      captureInstructions: captureInstructions,
      scriptPreamble: scriptPreamble,
      scriptPostamble: scriptPostamble,
      runInstructions: runInstructions
    };
  })(App);
