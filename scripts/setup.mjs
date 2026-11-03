import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) {
  console.log('.env 已存在，保留现有配置。');
} else {
  const password = randomBytes(18).toString('base64url');
  const text = readFileSync('.env.example', 'utf8')
    .replace('ADMIN_PASSWORD=\n', `ADMIN_PASSWORD=${password}\n`)
    .replace('DATA_ENCRYPTION_KEY=\n', `DATA_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\n`);
  writeFileSync('.env', text, { mode: 0o600 });
  console.log('已创建 .env（仅当前用户可读）。后台密码保存在 ADMIN_PASSWORD 中。');
}
