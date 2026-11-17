import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  detectInstallPlatform,
  getInstallGuideByPlatform,
  INSTALL_PLATFORM_GUIDES,
} from './pwa.ts';

describe('PWA Platform Detection & Install Guide Domain', () => {
  it('detects iPhone/iPad Safari and iPadOS desktop-mode user agents as ios', () => {
    assert.equal(
      detectInstallPlatform(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
        5,
      ),
      'ios',
    );
    assert.equal(
      detectInstallPlatform(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        5,
      ),
      'ios',
    );
  });

  it('detects Android, Windows, macOS, and Linux platforms accurately', () => {
    assert.equal(
      detectInstallPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36', 5),
      'android',
    );
    assert.equal(
      detectInstallPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0', 0),
      'windows',
    );
    assert.equal(
      detectInstallPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Chrome/125.0.0.0', 0),
      'macos',
    );
    assert.equal(
      detectInstallPlatform('Mozilla/5.0 (X11; Linux x86_64) Chrome/125.0.0.0', 0),
      'linux',
    );
  });

  it('provides non-empty installation steps for all 5 target platforms', () => {
    assert.equal(INSTALL_PLATFORM_GUIDES.length, 5);
    for (const id of ['android', 'ios', 'windows', 'macos', 'linux'] as const) {
      const guide = getInstallGuideByPlatform(id);
      assert.equal(guide.id, id);
      assert.ok(guide.steps.length >= 3);
      assert.ok(guide.browserHint.length > 5);
    }
  });
});
