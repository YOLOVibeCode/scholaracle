import jwt from 'jsonwebtoken';

export interface IConnectorTokenPayload {
  readonly type: 'connector';
  readonly scope: 'ingest';
  readonly userId: string;
  readonly jti: string;
}

export class ConnectorTokenService {
  private readonly _jwtSecret: string;
  private readonly _jwtExpiresIn: string;

  constructor(jwtSecret?: string, jwtExpiresIn?: string) {
    this._jwtSecret = jwtSecret ?? process.env['CONNECTOR_JWT_SECRET'] ?? process.env['JWT_SECRET'] ?? 'default-secret-change-in-production';
    this._jwtExpiresIn = jwtExpiresIn ?? process.env['CONNECTOR_JWT_EXPIRES_IN'] ?? '30d';
  }

  createToken(userId: string, jti: string): string {
    const payload: IConnectorTokenPayload = {
      type: 'connector',
      scope: 'ingest',
      userId,
      jti,
    };

    return jwt.sign(payload, this._jwtSecret, { expiresIn: this._jwtExpiresIn } as jwt.SignOptions);
  }

  verifyToken(token: string): IConnectorTokenPayload | null {
    try {
      const decoded = jwt.verify(token, this._jwtSecret) as IConnectorTokenPayload;
      if (decoded.type !== 'connector' || decoded.scope !== 'ingest' || !decoded.userId || !decoded.jti) return null;
      return decoded;
    } catch {
      return null;
    }
  }
}


