import * as http from 'node:http';
import { createLogger } from '../../../logger/dist/index.js';
import { getPort } from './config';
import { handleFakePortalRequest } from './requestHandler';

const logger = createLogger('fake-portal');
const port = getPort();

const server = http.createServer((req, res) => {
  void handleFakePortalRequest(req, res, logger, port);
});

server.listen(port, '127.0.0.1', () => {
  logger.info({ port }, 'fake portal listening');
});
