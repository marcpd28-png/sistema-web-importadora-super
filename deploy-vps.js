const { Client } = require('ssh2');

const sshConfig = {
  host: '187.127.248.226',
  port: 22,
  username: 'root',
  password: 'Pr0j3ct00r1g1n@l',
};

const commands = `
cd /home/IMPORTADORA
git reset --hard HEAD
git pull origin main
npm run build
pm2 restart importadora
`;

const client = new Client();
client.on('ready', () => {
  client.exec(commands, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      client.end();
      process.exit(code);
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).connect(sshConfig);
