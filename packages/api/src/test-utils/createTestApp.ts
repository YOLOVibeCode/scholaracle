import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { createErrorHandler } from '../middleware/errorHandler';

export interface ICreateTestAppContext {
  app: Express;
  database: Db;
}

export interface ICreateTestAppOptions {
  configure: (ctx: ICreateTestAppContext) => void;
  skipOnConnectFailure?: boolean;
}

export interface ICreateTestAppResult {
  app: Express;
  database: Db;
  mongoClient: MongoClient;
}

function resolveMongoConfig(): { uri: string; dbName: string } {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
  const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';
  return { uri, dbName };
}

async function connectTestMongo(
  skipOnConnectFailure: boolean
): Promise<{ mongoClient: MongoClient; database: Db } | null> {
  const { uri, dbName } = resolveMongoConfig();
  const mongoClient = new MongoClient(uri);
  try {
    await mongoClient.connect();
    return { mongoClient, database: mongoClient.db(dbName) };
  } catch (error) {
    if (skipOnConnectFailure) {
      // eslint-disable-next-line no-console
      console.warn('MongoDB not available, skipping integration tests');
      return null;
    }
    throw error;
  }
}

function buildTestExpressApp(database: Db, configure: ICreateTestAppOptions['configure']): Express {
  const app = express();
  app.use(express.json());
  configure({ app, database });
  app.use(createErrorHandler());
  return app;
}

export async function createTestApp(
  options: ICreateTestAppOptions
): Promise<ICreateTestAppResult | null> {
  const skipOnConnectFailure = options.skipOnConnectFailure ?? false;
  const connected = await connectTestMongo(skipOnConnectFailure);
  if (!connected) {
    return null;
  }
  const { mongoClient, database } = connected;
  const app = buildTestExpressApp(database, options.configure);
  return { app, database, mongoClient };
}

export async function closeTestApp(result: ICreateTestAppResult): Promise<void> {
  if (result.mongoClient) {
    await result.mongoClient.close();
  }
}
