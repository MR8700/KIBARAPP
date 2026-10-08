import { createHash, createSign, generateKeyPairSync, randomBytes, KeyObject } from 'crypto';

/** Authentificateur WebAuthn logiciel (attestation « none », ES256) : permet de rejouer de vraies cérémonies passkey en test. */

// --- Encodeur CBOR minimal (entiers, octets, textes, tableaux, maps) ---
function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(n, 1); return b;
}
type C = number | string | Buffer | C[] | Map<C, C>;
function cbor(v: C): Buffer {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') { const b = Buffer.from(v, 'utf8'); return Buffer.concat([head(3, b.length), b]); }
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(cbor)]);
  return Buffer.concat([head(5, v.size), ...[...v.entries()].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
}

const b64u = (b: Buffer) => b.toString('base64url');
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest();

export class VirtualAuthenticator {
  private priv: KeyObject; private pubJwk: { x: string; y: string };
  readonly credentialId = randomBytes(32);
  counter = 0;
  /** uv=false simule un appareil sans biométrie/code : le serveur doit le refuser. */
  constructor(private rpId = process.env.RP_ID ?? 'localhost', private origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000', private uv = true) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.priv = privateKey; this.pubJwk = publicKey.export({ format: 'jwk' }) as any;
  }
  get id() { return b64u(this.credentialId); }

  private clientData(type: string, challenge: string) {
    return Buffer.from(JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }));
  }

  /** Réponse à navigator.credentials.create(). */
  create(challenge: string) {
    const cose = new Map<C, C>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(this.pubJwk.x, 'base64url')], [-3, Buffer.from(this.pubJwk.y, 'base64url')]]);
    const idLen = Buffer.alloc(2); idLen.writeUInt16BE(this.credentialId.length);
    const counter = Buffer.alloc(4); counter.writeUInt32BE(this.counter);
    const authData = Buffer.concat([sha(this.rpId), Buffer.from([this.uv ? 0x45 : 0x41]), counter, Buffer.alloc(16), idLen, this.credentialId, cbor(cose)]);
    const attestationObject = cbor(new Map<C, C>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
    return {
      id: this.id, rawId: this.id, type: 'public-key', clientExtensionResults: {},
      response: { clientDataJSON: b64u(this.clientData('webauthn.create', challenge)), attestationObject: b64u(attestationObject), transports: ['internal'] },
    };
  }

  /** Réponse à navigator.credentials.get(). */
  get(challenge: string, userHandle?: string) {
    this.counter += 1;
    const counter = Buffer.alloc(4); counter.writeUInt32BE(this.counter);
    const authData = Buffer.concat([sha(this.rpId), Buffer.from([this.uv ? 0x05 : 0x01]), counter]);
    const cd = this.clientData('webauthn.get', challenge);
    const signature = createSign('sha256').update(Buffer.concat([authData, sha(cd)])).sign(this.priv);
    return {
      id: this.id, rawId: this.id, type: 'public-key', clientExtensionResults: {},
      response: { clientDataJSON: b64u(cd), authenticatorData: b64u(authData), signature: b64u(signature), ...(userHandle ? { userHandle } : {}) },
    };
  }
}
