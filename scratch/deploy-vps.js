const { Client } = require('ssh2');

const sshConfig = {
  host: '187.127.248.226',
  port: 22,
  username: 'root',
  password: 'Pr0j3ct00r1g1n@l',
};

const client = new Client();

client.on('ready', () => {
  console.log('SSH connection established. Starting deployment...');
  
  const deployScript = `
    cd /home/IMPORTADORA && \\
    echo "--- Pulling latest code ---" && \\
    git pull origin main && \\
    echo "--- Installing dependencies ---" && \\
    npm install && \\
    echo "--- Pushing DB schema ---" && \\
    npx prisma db push --skip-generate && \\
    echo "--- Generating Prisma Client ---" && \\
    npx prisma generate && \\
    echo "--- Building Next.js app ---" && \\
    npm run build && \\
    echo "--- Restarting PM2 process ---" && \\
    pm2 restart all
  `;

  client.exec(deployScript, (err, stream) => {
    if (err) {
      console.error('Error executing deploy script:', err);
      client.end();
      process.exit(1);
    }
    
    stream.on('close', (code, signal) => {
      console.log(`Deployment finished with code ${code}`);
      client.end();
      process.exit(code);
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).on('error', (err) => {
  console.error('SSH Error:', err);
  process.exit(1);
});

client.connect(sshConfig);
