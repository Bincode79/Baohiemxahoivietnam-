/* eslint-disable */
const http = require('http');

const BASE = process.env.BASE_URL || 'http://localhost:3001';
// Admin credentials come from ENV (no defaults baked into source).
// Server logs the randomly generated password on first boot.
const ADMIN_USERNAME = process.env.TEST_ADMIN_USERNAME || '';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || '';
let adminToken = '';
let totalPass = 0;
let totalFail = 0;
const failures = [];

function log(ok, name, detail) {
  if (ok) { totalPass++; console.log('  \u2713 ' + name); }
  else { totalFail++; failures.push({ name, detail }); console.log('  \u2717 ' + name + ' :: ' + detail); }
}

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(path, BASE);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        let json = null;
        try { json = buf ? JSON.parse(buf) : null; } catch (e) { json = { raw: buf }; }
        resolve({ status: res.statusCode, json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function uniqueId() { return Date.now().toString() + Math.random().toString(36).slice(2, 6); }

function randomPhone() { return '09' + Math.floor(Math.random() * 1000000000).toString().padStart(8, '0'); }
function randomIdNum() { return Math.floor(100000000000 + Math.random() * 899999999999).toString(); }

function padNum(s, n) {
  var out = '';
  for (var i = 0; i < s.length && out.length < n; i++) {
    var c = s[i];
    if (c >= '0' && c <= '9') out += c;
  }
  while (out.length < n) out = '0' + out;
  return out.slice(-n);
}

(async function main() {
  console.log('\n=== 1. Public endpoints ===');
  let r = await req('GET', '/api/provinces');
  log(r.status === 200 && Array.isArray(r.json), 'GET /api/provinces → array', 'status=' + r.status);

  r = await req('GET', '/api/vietqr/banks');
  const banks = (r.json && r.json.data) || [];
  log(r.status === 200 && Array.isArray(banks) && banks.length >= 20, 'GET /api/vietqr/banks ≥ 20 ngân hàng', 'got=' + (Array.isArray(banks) ? banks.length : typeof banks));

  console.log('\n=== 1.5 Get agencies ===');
  r = await req('GET', '/api/agencies');
  const agencies = (r.json && r.json.data && Array.isArray(r.json.data)) ? r.json.data : [];
  log(agencies.length > 0, 'GET /api/agencies returned ' + agencies.length + ' entries', '');

  console.log('\n=== 2. Register validation rejects missing data ===');
  const ts = uniqueId();
  r = await req('POST', '/api/auth/register', { FullName: 'Test ' + ts });
  log(r.status === 400 && r.json && r.json.errors, 'POST /api/register minimal \u2192 400 with errors', 'status=' + r.status);

  const proOnlyId = padNum('99' + ts.slice(2), 12);
  r = await req('POST', '/api/auth/register', {
    FullName: 'Nguyen Van Test ' + ts,
    IdNumber: proOnlyId,
    Phone: '098' + padNum(ts, 7),
    Email: 'test_' + Date.now() + Math.random().toString(36).slice(2) + '_t@example.com',
    AccountType: 'individual',
    Province: '99',
    Ward: '001',
    Street: '123 Test Street',
    PaymentMethod: 'transfer',
    BhxhCode: padNum('1' + ts, 10),
    BankAccountNumber: padNum(ts + '12', 12),
    BankAccountName: 'NGUYEN VAN TEST',
    BankBin: '970436',
    Gender: 'Nam',
    BirthDate: '1990-01-01',
    ReceivingAgency: 'BHXH_VN',
    Password: 'Test@1234'
  });
  log(r.status === 400, 'POST /api/register with bad Province \u2192 400', 'field=' + ((r.json && r.json.field) || '') + ' status=' + r.status);

  const TINY_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';
  const validUser = {
    FullName: 'Nguyen Van Test ' + ts,
    IdNumber: randomIdNum(),
    Phone: '09' + String(Math.floor(10000000 + Math.random() * 89999999)),
    Email: 'test_' + Date.now() + Math.random().toString(36).slice(2) + '@example.com',
    AccountType: 'individual',
    Province: '01',
    Ward: '001',
    Street: '123 Test Street',
    PaymentMethod: 'transfer',
    BhxhCode: padNum('1' + ts, 10),
    BankAccountNumber: String(Math.floor(100000000000 + Math.random() * 899999999999)),
    BankAccountName: 'NGUYEN VAN TEST',
    BankBin: '970436',
    Gender: 'Nam',
    BirthDate: '1990-01-01',
    ReceivingAgency: agencies[0] ? agencies[0].id : 'BHXH_VN',
    Password: 'Test@1234',
    Photo: 'data:image/png;base64,' + TINY_BASE64,
    CccdFront: 'data:image/png;base64,' + TINY_BASE64,
    CccdBack: 'data:image/png;base64,' + TINY_BASE64
  };
  r = await req('POST', '/api/auth/register', validUser);
  let registeredId = null;
  if (r.status === 201 && r.json && r.json.success) {
    registeredId = (r.json.data && r.json.data.userId) || null;
    log(!!registeredId, 'POST /api/register → success id=' + registeredId, JSON.stringify(r.json).slice(0, 150));
  } else {
    log(false, 'POST /api/register failed', JSON.stringify(r.json).slice(0, 200));
  }

  console.log('\n=== 3. Register validation (bad inputs) ===');
  r = await req('POST', '/api/auth/register', { full_name: 'A', cccd: '123', phone: 'wrong' });
  log(r.status === 400, 'POST /api/register bad fields \u2192 400', 'got=' + r.status);

  r = await req('POST', '/api/auth/register', { ...validUser, IdNumber: validUser.IdNumber });
  log(r.status === 400 || r.status === 409, 'POST /api/register duplicate-CCCD retry \u2192 400/409', 'got=' + r.status);

  console.log('\n=== 4. Admin login ===');
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    log(false, 'Admin login skipped', 'Set TEST_ADMIN_USERNAME and TEST_ADMIN_PASSWORD env vars (password is logged by server on first boot).');
    console.log('\n[skip admin tests: credentials not provided]');
    summary();
    return;
  }
  r = await req('POST', '/api/auth/login', { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  if (r.status === 200 && r.json && r.json.success && r.json.data && r.json.data.token) {
    adminToken = r.json.data.token;
    log(true, 'POST /api/auth/login admin', '');
  } else {
    log(false, 'POST /api/auth/login admin', JSON.stringify(r.json).slice(0, 200));
  }

  if (!adminToken) {
    console.log('\n[skip admin tests: token not available]');
    summary();
    return;
  }

  console.log('\n=== 5. Admin endpoints ===');
  r = await req('GET', '/api/admin/users', null, adminToken);
  const usersData = (r.json && r.json.data) || [];
  log(r.status === 200 && Array.isArray(usersData), 'GET /api/admin/users \u2192 array', 'status=' + r.status);

  r = await req('GET', '/api/admin/stats', null, adminToken);
  const statsData = (r.json && r.json.data) || {};
  log(r.status === 200 && statsData.total !== undefined, 'GET /api/admin/stats has total', JSON.stringify(statsData).slice(0, 100));

  r = await req('GET', '/api/admin/reports?days=30', null, adminToken);
  const reports = (r.json && r.json.data) || {};
  log(r.status === 200 && reports.summary && Array.isArray(reports.byDay), 'GET /api/admin/reports?days=30', 'status=' + r.status);

  if (registeredId) {
    r = await req('GET', '/api/admin/users/' + registeredId, null, adminToken);
    const userData = (r.json && r.json.data) || {};
    log(r.status === 200 && (userData.id || userData.full_name), 'GET /api/admin/users/:id', 'status=' + r.status);
  }

  console.log('\n=== 6. Admin \u2014 approve flow ===');
  if (registeredId) {
    r = await req('GET', '/api/admin/users', null, adminToken);
    const userList = (r.json && r.json.data) || [];
    const found = userList.find(function(u) { return u.id === registeredId; });
    log(!!found, 'User exists in admin list after register', '');

    r = await req('PUT', '/api/admin/users/' + registeredId + '/status', { status: 'approved' }, adminToken);
    log(r.status === 200 && r.json && r.json.success, 'PUT status=approved', 'status=' + r.status);

    r = await req('PUT', '/api/admin/users/' + registeredId + '/status', { status: 'invalid' }, adminToken);
    log(r.status === 400, 'PUT status invalid \u2192 400', 'got=' + r.status);

    r = await req('PUT', '/api/admin/users/999999999/status', { status: 'approved' }, adminToken);
    log(r.status === 404, 'PUT unknown user \u2192 404', 'got=' + r.status);
  }

  console.log('\n=== 7. QR admin ===');
  if (registeredId) {
    r = await req('GET', '/api/admin/user-qr/' + registeredId, null, adminToken);
    log(r.status === 200, 'GET admin user-qr', 'status=' + r.status);

    r = await req('POST', '/api/admin/user-qr/' + registeredId, {
      qr_enabled: true,
      qr_payment_type: 'bhxh',
      qr_amount: '500000',
      qr_account: '1234567890',
      qr_holder: 'NGUYEN VAN TEST',
      qr_bank_bin: '970436',
      qr_bank_name: 'Vietcombank',
      qr_content: 'Test'
    }, adminToken);
    log(r.status === 200 && r.json && r.json.success, 'POST admin user-qr save', 'status=' + r.status);

    r = await req('GET', '/api/vietqr/user/' + registeredId);
    const qrData = (r.json && r.json.data) || {};
    log(r.status === 200 && qrData.qrData, 'GET vietqr/user/:id \u2192 qrData', 'status=' + r.status);
  }

  console.log('\n=== 8. Reports recent ===');
  r = await req('GET', '/api/admin/reports?days=7', null, adminToken);
  const reportData = (r.json && r.json.data) || {};
  log(r.status === 200 && reportData.byDay && reportData.byDay.length >= 0, 'GET reports days=7 OK', '');

  summary();
})().catch(err => {
  console.error('Test runner failed:', err);
  console.log('\nEnsure server is running: npm run dev (or set BASE_URL=...)');
  summary();
});

function summary() {
  console.log('\n=== Summary ===');
  console.log('Passed: ' + totalPass);
  console.log('Failed: ' + totalFail);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(f => console.log('  - ' + f.name + ': ' + f.detail));
  }
  process.exit(totalFail ? 1 : 0);
}
