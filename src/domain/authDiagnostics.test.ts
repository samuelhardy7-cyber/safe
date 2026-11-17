import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  buildAuthContinueUrl,
  classifyHostingEnvironment,
  isDefaultFirebaseAuthorizedHostname,
  mapFirebaseAuthErrorDetails,
  redactSensitiveAuthText,
  shouldPreferGoogleRedirect,
  validateEmailAddressFormat,
  validateFirebaseConfigIntegrity,
} from './authDiagnostics.ts';

describe('Firebase Auth Diagnostics & Production Domain Helpers', () => {
  it('distinguishes development, staging/preview, and production hostnames cleanly', () => {
    assert.equal(classifyHostingEnvironment('localhost'), 'development');
    assert.equal(classifyHostingEnvironment('127.0.0.1'), 'development');
    assert.equal(
      classifyHostingEnvironment('higayon-git-feat-auth-org.vercel.app'),
      'staging_preview',
    );
    assert.equal(
      classifyHostingEnvironment('ais-dev-abc123.asia-east1.run.app'),
      'staging_preview',
    );
    assert.equal(classifyHostingEnvironment('higayon.vercel.app'), 'production');
    assert.equal(
      classifyHostingEnvironment('app.higayon.org', ['app.higayon.org']),
      'production',
    );
  });

  it('recognizes default Firebase-authorized domains vs external hosting domains like Vercel', () => {
    assert.equal(
      isDefaultFirebaseAuthorizedHostname('localhost', 'praxis-implement-h01dl'),
      true,
    );
    assert.equal(
      isDefaultFirebaseAuthorizedHostname(
        'praxis-implement-h01dl.firebaseapp.com',
        'praxis-implement-h01dl',
      ),
      true,
    );
    assert.equal(
      isDefaultFirebaseAuthorizedHostname('higayon.vercel.app', 'praxis-implement-h01dl'),
      false,
    );
  });

  it('validates single-project Firebase config integrity and rejects Vercel authDomain overrides', () => {
    const validResult = validateFirebaseConfigIntegrity({
      apiKey: 'AIzaTestKey123456',
      authDomain: 'praxis-implement-h01dl.firebaseapp.com',
      projectId: 'praxis-implement-h01dl',
      storageBucket: 'praxis-implement-h01dl.firebasestorage.app',
      messagingSenderId: '550394550664',
      appId: '1:550394550664:web:0d75ec05dc9c20c9da823d',
      firestoreDatabaseId: 'ai-studio-remixhigayonchur-6ad234a1-b5ec-466f-b61f-00dc3d1a78cd',
    });
    assert.equal(validResult.valid, true);
    assert.equal(validResult.authDomainMatchesProject, true);
    assert.equal(validResult.authDomainIsHostingOverride, false);

    const invalidVercelAuthDomain = validateFirebaseConfigIntegrity({
      apiKey: 'AIzaTestKey123456',
      authDomain: 'higayon.vercel.app',
      projectId: 'praxis-implement-h01dl',
      storageBucket: 'praxis-implement-h01dl.firebasestorage.app',
      messagingSenderId: '550394550664',
      appId: '1:550394550664:web:0d75ec05dc9c20c9da823d',
    });
    assert.equal(invalidVercelAuthDomain.valid, false);
    assert.equal(invalidVercelAuthDomain.authDomainIsHostingOverride, true);
  });

  it('maps auth/unauthorized-domain and all critical Firebase Auth errors to safe user messages without leaking raw error strings', () => {
    const domainErr = mapFirebaseAuthErrorDetails(
      {code: 'auth/unauthorized-domain', message: 'Firebase: Error (auth/unauthorized-domain).'},
      'higayon.vercel.app',
    );
    assert.equal(domainErr.isDomainError, true);
    assert.equal(domainErr.code, 'auth/unauthorized-domain');
    assert.ok(!domainErr.userMessage.includes('auth/'));
    assert.ok(!domainErr.userMessage.includes('Firebase:'));
    assert.ok(domainErr.safeTechnicalSummary.includes('higayon.vercel.app'));

    const popupBlocked = mapFirebaseAuthErrorDetails({code: 'auth/popup-blocked'});
    assert.equal(popupBlocked.isPopupBlocked, true);

    const opNotAllowed = mapFirebaseAuthErrorDetails({code: 'auth/operation-not-allowed'});
    assert.equal(opNotAllowed.isProviderDisabled, true);

    const netErr = mapFirebaseAuthErrorDetails({code: 'auth/network-request-failed'});
    assert.equal(netErr.isNetworkError, true);

    const keyErr = mapFirebaseAuthErrorDetails({code: 'auth/invalid-api-key'});
    assert.equal(keyErr.isInvalidApiKey, true);
  });

  it('validates email format, safe continue URLs, Google redirect selection, and redacts secrets', () => {
    assert.equal(validateEmailAddressFormat('').valid, false);
    assert.equal(validateEmailAddressFormat('invalid-email').valid, false);
    assert.equal(validateEmailAddressFormat('admin@gereja.org').valid, true);

    assert.equal(buildAuthContinueUrl('https://higayon.vercel.app/login'), 'https://higayon.vercel.app/');
    assert.equal(buildAuthContinueUrl('javascript:alert(1)'), null);

    assert.equal(
      shouldPreferGoogleRedirect({isStandalone: true, isIOS: true, isInIframe: false}),
      true,
    );
    assert.equal(
      shouldPreferGoogleRedirect({isStandalone: true, isIOS: true, isInIframe: true}),
      false,
    );

    const redacted = redactSensitiveAuthText('apiKey=AIzaSySecret1234567890 Bearer eyJhbGciOi...');
    assert.ok(!redacted.includes('AIzaSySecret'));
    assert.ok(!redacted.includes('eyJhbGciOi'));
  });
});
