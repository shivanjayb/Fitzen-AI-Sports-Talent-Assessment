import { createApp } from '../apps/server/src/app.ts';
import { loadConfig } from '../apps/server/src/config.ts';

const config = loadConfig();

const app = createApp(config);

export default function handler(req: any, res: any) {
  return new Promise<void>((resolve) => {
    res.on('finish', resolve);
    res.on('close', resolve);
    app.server.emit('request', req, res);
  });
}
