// ========== UTILITY ==========
function randomString(len) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var r = '';
  for (var i = 0; i < (len || 4); i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
  return r;
}

// ========== API REQUEST WITH RETRY ==========
var MAX_RETRIES = 3;
var RETRY_DELAYS = [1000, 3000, 8000];

function apiRequest(url, options, retries) {
  retries = retries || 0;
  return fetch(url, options)
    .then(function(response) {
      if (response.status === 429 && retries < MAX_RETRIES) {
        var delay = RETRY_DELAYS[retries] || 8000;
        console.log('[API] Rate limited. Retrying in ' + (delay/1000) + 's... (attempt ' + (retries + 1) + '/' + MAX_RETRIES + ')');
        return new Promise(function(resolve) { setTimeout(function() { resolve(apiRequest(url, options, retries + 1)); }, delay); });
      }
      return response;
    })
    .catch(function(error) {
      if (retries < MAX_RETRIES) {
        var delay = RETRY_DELAYS[retries] || 8000;
        console.log('[API] Network error. Retrying in ' + (delay/1000) + 's... (attempt ' + (retries + 1) + '/' + MAX_RETRIES + ')');
        return new Promise(function(resolve) { setTimeout(function() { resolve(apiRequest(url, options, retries + 1)); }, delay); });
      }
      throw error;
    });
}

function showToast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast-notification ' + (type || 'info');
  t.classList.add('show');
  setTimeout(function () { t.classList.remove('show'); }, 3000);
}

// ========== LOGIN MODAL ==========
function showLoginModal() {
  document.getElementById('loginModal').removeAttribute('hidden');
  document.getElementById('loginModal').setAttribute('aria-hidden', 'false');
  document.body.classList.add('lm-open');
}
function hideLoginModal() {
  document.getElementById('loginModal').setAttribute('hidden', '');
  document.getElementById('loginModal').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('lm-open');
}
document.addEventListener('keydown', function(e) {
  var m = document.getElementById('loginModal');
  if (e.key === 'Escape' && !m.hasAttribute('hidden')) hideLoginModal();
});

function switchLoginTab(type, el) {
  document.querySelectorAll('.lm-tab').forEach(function(t) { t.classList.remove('active'); });
  el.classList.add('active');
}

// ========== LOGIN HANDLER ==========
function handleLogin(e) {
  e.preventDefault();
  var u = document.getElementById('loginUsername').value.trim();
  var p = document.getElementById('loginPassword').value.trim();
  if (!u || !p) { showToast('Vui lòng nhập tên đăng nhập và mật khẩu!', 'error'); return; }
  apiRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p })
  })
    .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); })
    .then(function(res) {
      if (res.data.success) {
        localStorage.setItem('authToken', res.data.token);
        localStorage.setItem('authRole', res.data.role || 'user');
        showToast('Đăng nhập thành công!', 'success');
        hideLoginModal();
        if (res.data.redirect) {
          window.location.href = res.data.redirect;
        }
      } else {
        showToast(res.data.error || 'Đăng nhập thất bại!', 'error');
      }
    })
    .catch(function() { showToast('Không thể kết nối máy chủ!', 'error'); });
}

function togglePwd() {
  var p = document.getElementById('loginPassword');
  p.type = p.type === 'password' ? 'text' : 'password';
}

// ========== CAPTCHA ==========
function refreshLoginCaptcha() {
  var box = document.getElementById('loginCaptchaBox');
  if (!box) return;
  box.innerHTML = '<span>' + randomString(4) + '</span>';
}

// ========== STATS ANIMATION ==========
function animateStats() {
  var received = 10585112;
  var processed = 10311515;
  var percent = 93.76;
  animateNumber('statReceived', received);
  animateNumber('statProcessed', processed);
  var pEl = document.getElementById('statPercent');
  if (pEl) {
    var current = 0;
    var step = percent / 40;
    var interval = setInterval(function() {
      current += step;
      if (current >= percent) { current = percent; clearInterval(interval); }
      pEl.textContent = current.toFixed(2) + '%';
    }, 30);
  }
}

function animateNumber(id, target) {
  var el = document.getElementById(id);
  if (!el) return;
  var current = 0;
  var step = Math.ceil(target / 40);
  var interval = setInterval(function() {
    current += step;
    if (current >= target) { current = target; clearInterval(interval); }
    el.textContent = current.toLocaleString('vi-VN');
  }, 30);
}

// ========== PROVIDER DATA ==========
var ivanProviders = [
  { name: 'V1NBHXH', logo: 'vinbhxh_logo.svg', color: '#7bad0d' },
  { name: 'VNPT-CA', color: '#0372b6' },
  { name: 'ThaisonSoft', color: '#de8010' },
  { name: 'EFY', logo: 'efly ca.svg', color: '#8b5cf6' },
  { name: 'TS24 Corp', logo: 'ts24corp.svg', color: '#7bad0d' },
  { name: 'Vietnam Post', logo: 'vnpost-01.svg', color: '#0372b6' },
  { name: 'Viettel-CA', logo: 'viettel ca-01.svg', color: '#de8010' },
  { name: 'BkavCA', color: '#8b5cf6' },
  { name: 'MISA', logo: 'misa_logo.svg', color: '#7bad0d' },
  { name: 'CyberLotus', logo: 'CyberLotus.svg', color: '#0372b6' },
  { name: 'IBH Insurance', logo: 'ibh_logo.svg', color: '#de8010' },
  { name: 'iCare', logo: 'ICARE.svg', color: '#8b5cf6' },
  { name: 'mBHXH', logo: 'mbhxh_logo.svg', color: '#7bad0d' },
  { name: '1Office', logo: '1Office_logo.svg', color: '#0372b6' },
];

var caProviders = [
  { name: 'EasyCA', logo: 'easyCA.svg', color: '#7bad0d' },
  { name: 'Newtel-CA', logo: 'LogoNewtel_CA.svg', color: '#0372b6' },
  { name: 'BkavCA', color: '#de8010' },
  { name: 'Viettel-CA', logo: 'viettel ca-01.svg', color: '#8b5cf6' },
  { name: 'SafeCert Corp', logo: 'safe-01.svg', color: '#7bad0d' },
  { name: 'FPT', logo: 'fpt.svg', color: '#0372b6' },
  { name: 'SmartSign', logo: 'smart sign.svg', color: '#de8010' },
  { name: 'EFY-CA', logo: 'efly ca.svg', color: '#8b5cf6' },
  { name: 'MISA', logo: 'misa_logo.svg', color: '#7bad0d' },
  { name: 'FastCA', logo: 'fastca_logo.svg', color: '#0372b6' },
  { name: 'TrustCA', logo: 'LogoTrustCA.svg', color: '#de8010' },
  { name: 'I-CA', logo: 'i-ca_logo.svg', color: '#8b5cf6' },
  { name: 'Hilo-CA', logo: 'hilo_ca_logo.svg', color: '#7bad0d' },
  { name: 'One-CA', logo: 'OneCA_logo.svg', color: '#0372b6' },
  { name: 'ECA', logo: 'ECA-logo.svg', color: '#de8010' },
];

function renderProviders(containerId, providers) {
  var grid = document.getElementById(containerId);
  if (!grid) return;
  grid.innerHTML = '';
  providers.forEach(function(p) {
    var div = document.createElement('div');
    div.className = 'provider-item';
    div.title = p.name;
    if (p.logo) {
      div.innerHTML = '<img src="/images/' + p.logo + '" alt="' + p.name + '" />';
    } else {
      div.innerHTML =
        '<svg width="120" height="40" viewBox="0 0 120 40"><rect width="120" height="40" fill="none"/><text x="60" y="24" text-anchor="middle" fill="' + p.color + '" font-size="13" font-weight="700" font-family="Inter,sans-serif">' + p.name + '</text></svg>';
    }
    div.addEventListener('click', function() { showToast(p.name, 'info'); });
    grid.appendChild(div);
  });
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', function() {
  animateStats();
  refreshLoginCaptcha();

  // Scroll animation for provider items
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        var items = entry.target.querySelectorAll('.provider-item');
        items.forEach(function(item, idx) {
          setTimeout(function() {
            item.style.opacity = '1';
            item.style.transform = 'translateY(0)';
          }, idx * 40);
        });
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.providers-grid').forEach(function(grid) {
    grid.querySelectorAll('.provider-item').forEach(function(item) {
      item.style.opacity = '0';
      item.style.transform = 'translateY(16px)';
      item.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
    });
    observer.observe(grid);
  });

  // data-open-login handler
  document.querySelectorAll('[data-open-login]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      showLoginModal();
    });
  });
  // backdrop + close button
  var modal = document.getElementById('loginModal');
  if (modal) {
    modal.querySelectorAll('[data-close-login]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.preventDefault();
        hideLoginModal();
      });
    });
    modal.addEventListener('click', function(e) {
      if (e.target === modal || e.target.classList.contains('login-modal__backdrop')) {
        hideLoginModal();
      }
    });
  }

  // auto-show login modal if ?redirect= is in URL
  var params = new URLSearchParams(window.location.search);
  if (params.has('redirect')) {
    showLoginModal();
  }
});
