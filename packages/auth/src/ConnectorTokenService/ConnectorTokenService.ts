import jwt from 'jsonwebtoken';

const MAX_CONNECTOR_EXPIRES_IN = '90d';

export interface IConnectorTokenPayload {
  readonly type: 'connector';
  readonly scope: 'ingest';
  readonly userId: string;
  readonly jti: string;
  readonly deviceId: string;
}

function clampExpiresIn(requested: string): string {
  const match = /^(\d+)\s*d$/i.exec(requested.trim());
  if (match) {
    const days = Number(match[1]);
    if (days > 90) return MAX_CONNECTOR_EXPIRES_IN;
  }
  return requested.trim().length > 0 ? requested : MAX_CONNECTOR_EXPIRES_IN;
}

export class ConnectorTokenService {
  private readonly _jwtSecret: string;
  private readonly _jwtExpiresIn: string;

  constructor(jwtSecret?: string, jwtExpiresIn?: string) {
    this._jwtSecret =
      jwtSecret ??
      process.env['CONNECTOR_JWT_SECRET'] ??
      process.env['JWT_SECRET'] ??
      'default-secret-change-in-production';
    const configured =
      jwtExpiresIn ?? process.env['CONNECTOR_JWT_EXPIRES_IN'] ?? MAX_CONNECTOR_EXPIRES_IN;
    this._jwtExpiresIn = clampExpiresIn(configured);
  }

  get expiresInLabel(): string {
    return this._jwtExpiresIn;
  }

  createToken(userId: string, jti: string, deviceId: string): string {
    const payload: IConnectorTokenPayload = {
      type: 'connector',
      scope: 'ingest',
      userId,
      jti,
      deviceId,
    };

    return jwt.sign(payload, this._jwtSecret, { expiresIn: this._jwtExpiresIn } as jwt.SignOptions);
  }

  verifyToken(token: string): IConnectorTokenPayload | null {
    try {
      const decoded = jwt.verify(token, this._jwtSecret) as IConnectorTokenPayload;
      if (
        decoded.type !== 'connector' ||
        decoded.scope !== 'ingest' ||
        !decoded.userId ||
        !decoded.jti ||
        !decoded.deviceId
      )
        return null;
      return decoded;
    } catch {
      return null;
    }
  }
}
