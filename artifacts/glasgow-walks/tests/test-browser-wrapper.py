#!/usr/bin/env python3
"""Regression tests for the local browser-suite wrapper."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

WRAPPER = Path(__file__).resolve().parents[1] / 'run-browser-suite.sh'
STEPS = [
    'test:planner', 'test:walks', 'test:itinerary:browser',
    'test:access:browser', 'test:category:browser',
    'test:starting-areas:browser', 'test:email:browser', 'test:walks:browser',
]


class BrowserWrapperTests(unittest.TestCase):
    def test_success_and_each_failure_from_another_directory(self):
        with tempfile.TemporaryDirectory(prefix='browser wrapper ') as tmp:
            root = Path(tmp) / 'repo with spaces'
            app = root / 'artifacts' / 'glasgow-walks'
            app.mkdir(parents=True)
            wrapper = app / WRAPPER.name
            shutil.copy(WRAPPER, wrapper)
            bin_dir = Path(tmp) / 'bin'
            bin_dir.mkdir()
            pnpm = bin_dir / 'pnpm'
            pnpm.write_text('#!/usr/bin/env bash\n'
                            'printf "%s|%s\\n" "$PWD" "$4" >> "$CALLS"\n'
                            'if [[ "$4" == "$FAIL_STEP" ]]; then exit 17; fi\n')
            pnpm.chmod(0o755)
            calls = Path(tmp) / 'calls'
            for failure in ['', *STEPS]:
                with self.subTest(failure=failure):
                    calls.unlink(missing_ok=True)
                    env = dict(os.environ, PATH=f'{bin_dir}:{os.environ["PATH"]}',
                               CALLS=str(calls), FAIL_STEP=failure)
                    result = subprocess.run(['bash', str(wrapper)], cwd=tmp, env=env,
                                            text=True, capture_output=True)
                    self.assertEqual(result.returncode, 1 if failure else 0, result.stderr)
                    self.assertEqual(calls.read_text().splitlines(),
                                     [f'{root}|{step}' for step in STEPS])
                    log = (app / 'browser-suite.log').read_text()
                    for step in STEPS:
                        status = f'[FAIL] {step} (exit 17)' if step == failure else f'[PASS] {step}'
                        self.assertIn(status, log)
                        self.assertIn(status, result.stdout)


if __name__ == '__main__':
    unittest.main()
