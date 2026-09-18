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

function apiPost(path, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = http.request(`http://localhost:5000${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('--- 1. Testing Dynamic Reports (Removed 0865 & 0769) ---');
  const dynReports = await apiGet('/api/dynamic-reports?status=Published');
  console.log('Dynamic reports count:', dynReports.data?.length || 0);
  const has0865 = (dynReports.data || []).some(r => (r.title || '').includes('0865') || (r.title || '').includes('0769'));
  console.log('Has 0865 or 0769 reports:', has0865);
  if (!has0865) console.log('PASS: No unwanted audit reports.');

  console.log('\n--- 2. Testing Super Admin Dashboard Stats ---');
  const dashStats = await apiGet('/api/dashboard/superadmin-stats');
  console.log('Super Admin Stats:', dashStats.stats);
  console.log('Users Total:', dashStats.stats?.users?.total);
  console.log('Employees Total:', dashStats.stats?.employees?.total);
  console.log('Receipts Total:', dashStats.stats?.receipts?.total);

  console.log('\n--- 3. Testing Report Synchronization SuperAdmin -> Admin ---');
  // Create a receipt from SuperAdmin
  const testRcpt = await apiPost('/api/receipts', {
    donorName: 'Test Sync Donor SuperAdmin',
    amount: 5500,
    donationHead: 'General Donation',
    donationType: 'Voluntary Donation',
    paymentMode: 'Online / UPI',
    createdBy: 'Super Admin',
    isSuperAdminReceipt: true
  });
  console.log('Created SuperAdmin receipt:', testRcpt.success, testRcpt.data?.receiptNo);

  // Check in Admin receipts list with custom trust email
  const adminReceipts = await apiGet('/api/receipts?status=Active&trustEmail=testtrust@example.com&limit=20');
  console.log('Admin query receipts count:', adminReceipts.data?.length || 0);
  const foundInAdmin = (adminReceipts.data || []).some(r => r.donorName === 'Test Sync Donor SuperAdmin');
  console.log('Found SuperAdmin receipt in Admin panel:', foundInAdmin);

  // Check in 10BD report
  const rep10bd = await apiGet('/api/reports/10bd');
  const foundIn10bd = (rep10bd.data || []).some(r => r.donorName === 'Test Sync Donor SuperAdmin');
  console.log('Found in Form 10BD Report:', foundIn10bd);

  // Check in Receipts report
  const repRcpt = await apiGet('/api/reports/receipts');
  const foundInRcptRep = (repRcpt.data || []).some(r => r.name === 'Test Sync Donor SuperAdmin');
  console.log('Found in Receipts Report:', foundInRcptRep);

  // Check in Donor report
  const repDonor = await apiGet('/api/reports/donor-report');
  const foundInDonorRep = (repDonor.data || []).some(r => r.name === 'Test Sync Donor SuperAdmin');
  console.log('Found in Donor Report:', foundInDonorRep);

  if (foundInAdmin && foundIn10bd && foundInRcptRep && foundInDonorRep) {
    console.log('\nALL TESTS PASSED! SuperAdmin additions successfully sync to Admin reports and lists.');
  } else {
    console.log('\nSOME CHECKS FAILED - REVIEW OUTPUT ABOVE.');
  }
}

runTests().catch(console.error);
