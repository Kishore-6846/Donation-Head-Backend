const http = require('http');

http.get('http://localhost:5000/api/dashboard/superadmin-stats', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const data = JSON.parse(body);
    console.log('Super Admin Dashboard Stats:');
    console.log(JSON.stringify(data.stats, null, 2));
    console.log('Recent Users Count:', data.recentUsers.length);
    console.log('Recent Users:', data.recentUsers);
  });
}).on('error', err => {
  console.error(err);
});
