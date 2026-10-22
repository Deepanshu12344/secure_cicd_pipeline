/**
 * Cryptography and Insecure Randomness Rules
 */

export const scanCrypto = (filePath, content) => {
  const issues = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((lineText, idx) => {
    const trimmed = lineText.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
      return;
    }

    // Weak hash algorithms: MD5 or SHA1
    if (/(?:createHash|hashlib\.(?:md5|sha1)|crypto\.createHash)\s*\(\s*['"](?:md5|sha1)['"]/i.test(lineText) ||
        /\b(?:MD5|SHA1)_Init\b/i.test(lineText)) {
      issues.push({
        id: 'CRY-001',
        title: 'Weak Hash Algorithm (MD5/SHA-1)',
        threatType: 'Weak Cryptography',
        severity: 'MEDIUM',
        file: filePath,
        line: idx + 1,
        match: trimmed.slice(0, 100),
        description: 'MD5 and SHA-1 are cryptographically broken and vulnerable to collision attacks.',
        remediation: 'Use SHA-256, SHA-512, or password hashing functions like bcrypt / argon2 / scrypt.'
      });
    }

    // Broken ciphers: DES, RC4
    if (/['"](?:des|des-ede|rc4|blowfish)['"]/i.test(lineText) && /cipher/i.test(lineText)) {
      issues.push({
        id: 'CRY-002',
        title: 'Broken Encryption Cipher (DES/RC4)',
        threatType: 'Weak Cryptography',
        severity: 'HIGH',
        file: filePath,
        line: idx + 1,
        match: trimmed.slice(0, 100),
        description: 'Legacy cipher (DES/RC4) is insecure and easily decrypted by modern attackers.',
        remediation: 'Use AES-256-GCM or ChaCha20-Poly1305 for authenticated symmetric encryption.'
      });
    }

    // Insecure token generation with Math.random()
    if (/Math\.random\(\)/.test(lineText) && /(?:token|secret|password|auth|salt|iv|nonce|key|session)/i.test(lineText)) {
      issues.push({
        id: 'CRY-003',
        title: 'Cryptographically Weak Randomness for Security Artifact',
        threatType: 'Weak Cryptography',
        severity: 'MEDIUM',
        file: filePath,
        line: idx + 1,
        match: trimmed.slice(0, 100),
        description: 'Math.random() is pseudorandom and predictable. It should never generate security tokens or keys.',
        remediation: 'Use crypto.randomBytes() (Node.js) or crypto.getRandomValues() (Web API).'
      });
    }
  });

  return issues;
};
