const http = require('http');

function apiGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:5000${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function verify() {
  console.log('=== 1. Checking Super Admin Dashboard Stats (Clean 0 State) ===');
  const saStats = await apiGet('/api/dashboard/superadmin-stats');
  console.log('Super Admin Stats:', JSON.stringify(saStats.stats, null, 2));
  console.log('Recent Receipts Count:', saStats.recentReceipts?.length || 0);
  console.log('Recent Users Count:', saStats.recentUsers?.length || 0);

  console.log('\n=== 2. Checking Trust Admin Dashboard Stats (Clean 0 State) ===');
  const trustStats = await apiGet('/api/dashboard/stats');
  console.log('Trust Dashboard Stats:', JSON.stringify(trustStats.stats, null, 2));

  console.log('\n=== 3. Checking Receipts Directory (0 records) ===');
  const receipts = await apiGet('/api/receipts?status=Active&limit=100');
  console.log('Receipts count:', receipts.total ?? receipts.data?.length ?? 0);

  console.log('\n=== 4. Checking Users & Employees (0 records) ===');
  const users = await apiGet('/api/users');
  console.log('Users count:', users.data?.length ?? 0);
  const employees = await apiGet('/api/employees');
  console.log('Employees count:', employees.data?.length ?? 0);

  console.log('\n=== 5. Checking Reports (Clean 0 records) ===');
  const rep10bd = await apiGet('/api/reports/10bd');
  console.log('10BD report entries:', rep10bd.totalEntries ?? rep10bd.data?.length ?? 0);
  const repRcpt = await apiGet('/api/reports/receipts');
  console.log('Receipts report entries:', repRcpt.totalEntries ?? repRcpt.data?.length ?? 0);
  const repDonor = await apiGet('/api/reports/donor-report');
  console.log('Donor report entries:', repDonor.totalEntries ?? repDonor.data?.length ?? 0);

  const clean = (
    (saStats.stats?.users?.total === 0) &&
    (saStats.stats?.employees?.total === 0) &&
    (saStats.stats?.receipts?.total === 0) &&
    (trustStats.stats?.allReceipts === 0) &&
    (receipts.total === 0) &&
    (users.data?.length === 0) &&
    (employees.data?.length === 0)
  );

  if (clean) {
    console.log('\nSUCCESS: All dummy data completely wiped out. Application is starting 100% clean from scratch!');
  } else {
    console.log('\nWARNING: Some counts are not 0. Review above.');
  }
}

verify().catch(console.error);
