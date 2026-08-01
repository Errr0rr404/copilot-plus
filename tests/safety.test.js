'use strict';

const safety = require('../src/safety');
const { ok, eq, includes } = require('./_assert');

it('detects an AWS access key', () => {
  const findings = safety.scan('here is my key AKIAIOSFODNN7EXAMPLE please use it');
  ok(findings.length >= 1, 'expected at least one finding');
  ok(findings.some(f => f.kind === 'aws_access_key'), 'kind should be aws_access_key');
});

it('detects a GitHub token', () => {
  const findings = safety.scan('export GH_TOKEN=ghp_1234567890abcdefghij1234567890ABCDEF');
  ok(findings.some(f => f.kind === 'github_token'));
});

it('detects an OpenAI key', () => {
  const findings = safety.scan('OPENAI_API_KEY=sk-1234567890abcdefghij');
  ok(findings.some(f => f.kind === 'openai_key'));
});

it('detects an Anthropic key', () => {
  const findings = safety.scan('ANTHROPIC_API_KEY=sk-ant-1234567890abcdefghij1234567890abcdefghij');
  ok(findings.some(f => f.kind === 'anthropic_key'));
});

it('detects a Google API key', () => {
  const findings = safety.scan('key=AIzaSyA1234567890abcdefghij1234567890ABC');
  ok(findings.some(f => f.kind === 'google_api_key'));
});

it('detects a private key header', () => {
  const findings = safety.scan('-----BEGIN RSA PRIVATE KEY-----\nXXXX');
  ok(findings.some(f => f.kind === 'private_key'));
});

it('detects a JWT', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const findings = safety.scan(jwt);
  ok(findings.some(f => f.kind === 'jwt'));
});

it('respects disabledKinds', () => {
  const findings = safety.scan(
    'export GH_TOKEN=ghp_1234567890abcdefghij1234567890ABCDEF',
    { disabledKinds: ['github_token'] }
  );
  ok(!findings.some(f => f.kind === 'github_token'), 'should be skipped');
});

it('redact replaces matches in place', () => {
  const text = 'token=ghp_1234567890abcdefghij1234567890ABCDEF and other';
  const findings = safety.scan(text);
  const redacted = safety.redact(text, findings);
  includes(redacted, '[REDACTED:github_token]');
  ok(!redacted.includes('ghp_1234567890abcdefghij1234567890ABCDEF'));
});

it('clean text returns no findings', () => {
  const findings = safety.scan('this is a totally innocent message about cookies');
  eq(findings.length, 0);
});
