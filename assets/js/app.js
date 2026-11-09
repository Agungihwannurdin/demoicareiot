/* iCare GitHub Pages demo: simulated data in browser only. No PHP/MySQL, no real device commands, no real authentication. */
(() => {
    'use strict';
    const root = document.getElementById('app');
    const BASE = (window.ICARE_BASE || '').replace(/\/$/, '');
    const icon = (name, size = '') => `<svg aria-hidden="true" class="ico ${size}"><use href="#i-${name}"></use></svg>`;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
    const num = (v, d = 1) => (v === null || v === undefined || v === '') ? '—' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: d });
    let page = window.ICARE_INITIAL_VIEW || 'welcome', session = null, csrf = '';
    let loginError = '', adminTab = (page === 'admin' && window.ICARE_INITIAL_TAB) || 'users', userTab = (page === 'user' && window.ICARE_INITIAL_TAB) || 'home', modal = null, search = '';
    let users = [], devices = [], selectedDevice = 0, state = null, loading = false;
    // Demo store is ephemeral: resets on every page reload, never transmits data.
    const demo = {
        users: [{ id: 1, name: 'Pengguna Demo', username: 'pengguna_demo', email: 'demo@example.invalid', role: 'user', is_active: 1, device_id: 1, device: 'iCare DC-001' }],
        devices: [{ id: 1, device_uid: 'DC-001', name: 'iCare DC-001', location_name: 'Lahan Demonstrasi', can_control: true, last_seen_at: new Date().toISOString().slice(0,19).replace('T',' ') }],
        pump: false
    };
    const demoReadings = () => {
        const t = Date.now() / 60000;
        const wave = (base, amp, speed, offset = 0) => +(base + amp * Math.sin(t / speed + offset)).toFixed(1);
        return { temperature_c: wave(29.5,1.8,13), humidity_rh: wave(68,5,19,1), soil_moisture_pct: wave(43,8,16,2), water_level_pct: wave(76,6,29,3), pump_on: Number(demo.pump) };
    };
    function mockHistory() {
        return Array.from({length: 48}, (_, i) => {
            const ts = new Date(Date.now() - (47 - i) * 30 * 60000);
            const x = i / 5;
            return { recorded_at: ts.toISOString().slice(0,19).replace('T',' '), temperature_c: +(29.5 + 1.8*Math.sin(x)).toFixed(1), humidity_rh: +(68 + 5*Math.sin(x+1)).toFixed(1), soil_moisture_pct: +(43 + 8*Math.sin(x+2)).toFixed(1), water_level_pct: +(76 + 6*Math.sin(x+3)).toFixed(1) };
        });
    }
    async function api(url, method = 'GET', data) {
        const path = url.split('?')[0];
        if (path === '/api/session') return { user: session, csrf: 'demo' };
        if (path === '/api/login') return { user: { role: data.role, name: data.role === 'admin' ? 'Administrator Demo' : 'Pengguna Demo', username: data.role === 'admin' ? 'admin_demo' : 'pengguna_demo' }, csrf: 'demo' };
        if (path === '/api/logout') return { csrf: 'demo' };
        if (path === '/api/devices' && method === 'GET') return { devices: demo.devices.map(d => ({...d, last_seen_at: new Date().toISOString().slice(0,19).replace('T',' ')})) };
        if (path === '/api/users') {
            if (method === 'POST') { if (!data.name || !data.username) throw Error('Nama dan username wajib diisi.'); demo.users.push({...data,id: Math.max(0,...demo.users.map(u=>u.id))+1, is_active:1, device: demo.devices.find(d=>d.id===data.device_id)?.name || 'Belum ditetapkan'}); return {ok:true}; }
            return { users: demo.users.map(u=>({...u,device:demo.devices.find(d=>d.id===Number(u.device_id))?.name || 'Belum ditetapkan'})) };
        }
        if (path === '/api/state') {
            const d=demo.devices.find(x=>x.id === selectedDevice) || demo.devices[0];
            return { device: {...d, online:true, reading_fresh:true, pump_on:Number(demo.pump)}, reading:demoReadings(), command:null, history:mockHistory(), weather: {text:'Cerah berawan (simulasi)',status:'ok'} };
        }
        if (/^\/api\/devices\/\d+\/pump$/.test(path)) {demo.pump=Boolean(data.on);return {ok:true};}
        if (path === '/api/password') return {csrf:'demo'};
        if (/^\/api\/users\/\d+\/status$/.test(path)) {const u=demo.users.find(u=>u.id===Number(path.split('/')[3]));if(u)u.is_active=Number(data.active);return {ok:true};}
        if (/^\/api\/users\/\d+$/.test(path)) {const u=demo.users.find(u=>u.id===Number(path.split('/')[3]));if(u) Object.assign(u,data);return {ok:true};}
        if (path === '/api/devices' && method === 'POST') {const id=Math.max(0,...demo.devices.map(d=>d.id))+1;demo.devices.push({...data,id,can_control:true,last_seen_at:null});return {device_uid:data.device_uid,device_key:'KUNCI-DEMO-TIDAK-VALID'};}
        if (/\/rotate-key$/.test(path)) return {device_uid:'DC-DEMO',device_key:'KUNCI-DEMO-TIDAK-VALID'};
        throw new Error('Aksi ini tidak tersedia dalam Mode Demo.');
    }
    function brand() { return `<div class="brand">${icon('sprout', 'xl')}<div><div class="brand-word">iCare</div><div class="brand-sub">Smart Irrigation System</div></div></div>`; }
    // Notifikasi profesional, tidak memblokir halaman, tidak mengubah state pompa.
    function toast(message, category = '') {
        const text = String(message ?? '');
        const kind = category || (/gagal|error|tidak dapat|salah|ditolak/i.test(text) ? 'error' : /offline|menunggu|belum|periksa/i.test(text) ? 'warning' : /berhasil|disimpan|diperbarui|disalin|terdaftar/i.test(text) ? 'success' : 'info');
        const icons = { success: 'check', warning: 'info', error: 'close', info: 'bell' };
        const titles = { success: 'Berhasil', warning: 'Perhatian', error: 'Terjadi masalah', info: 'Informasi iCare' };
        let stack = document.querySelector('.icare-toast-stack');
        if (!stack) { stack = document.createElement('div'); stack.className = 'icare-toast-stack'; stack.setAttribute('aria-live', 'polite'); document.body.appendChild(stack); }
        while (stack.children.length >= 3) stack.firstElementChild.remove();
        const el = document.createElement('div');
        el.className = `icare-toast toast-${kind}`;
        el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
        el.innerHTML = `<div class="icare-toast-icon">${icon(icons[kind] || 'bell')}</div><div class="icare-toast-copy"><strong>${titles[kind] || titles.info}</strong><p>${esc(text)}</p></div><button type="button" class="icare-toast-close" aria-label="Tutup notifikasi">${icon('close','sm')}</button><span class="icare-toast-progress"></span>`;
        stack.appendChild(el);
        const dismiss = () => { el.classList.add('dismiss'); window.setTimeout(() => el.remove(), 220); };
        el.querySelector('button').addEventListener('click', dismiss);
        let timer = window.setTimeout(dismiss, kind === 'error' ? 6500 : 4600);
        el.addEventListener('mouseenter', () => { window.clearTimeout(timer); el.querySelector('.icare-toast-progress')?.classList.add('paused'); });
        el.addEventListener('mouseleave', () => { el.querySelector('.icare-toast-progress')?.classList.remove('paused'); timer = window.setTimeout(dismiss, 2200); });
    }
    // Pengganti window.confirm() agar dialog kontrol pompa dan aksi admin konsisten.
    function confirmDialog({ title, message, ok = 'Ya, lanjutkan', danger = false, iconName = 'info', onlyOk = false }) {
        return new Promise(resolve => {
            const previousFocus = document.activeElement;
            const layer = document.createElement('div');
            layer.className = 'icare-confirm-backdrop';
            layer.innerHTML = `<section class="icare-confirm ${danger ? 'is-danger' : ''}" role="alertdialog" aria-modal="true" aria-labelledby="icare-confirm-title" aria-describedby="icare-confirm-description"><div class="icare-confirm-mark">${icon(iconName,'xl')}</div><h3 id="icare-confirm-title">${esc(title)}</h3><p id="icare-confirm-description">${esc(message)}</p><div class="icare-confirm-actions">${onlyOk ? '' : '<button type="button" class="outline-button" data-dialog-cancel>Batal</button>'}<button type="button" class="grad-button" data-dialog-ok>${esc(ok)}</button></div></section>`;
            document.body.appendChild(layer);
            const close = value => { document.removeEventListener('keydown', onKey); layer.remove(); previousFocus?.focus?.(); resolve(value); };
            const onKey = event => {
                if (event.key === 'Escape') { event.preventDefault(); close(false); }
                if (event.key === 'Tab') {
                    const buttons = [...layer.querySelectorAll('button')];
                    const index = buttons.indexOf(document.activeElement);
                    if (event.shiftKey && index <= 0) { event.preventDefault(); buttons.at(-1)?.focus(); }
                    else if (!event.shiftKey && index === buttons.length - 1) { event.preventDefault(); buttons[0]?.focus(); }
                }
            };
            document.addEventListener('keydown', onKey);
            layer.addEventListener('click', event => {
                if (event.target === layer || event.target.closest('[data-dialog-cancel]')) return close(false);
                if (event.target.closest('[data-dialog-ok]')) return close(true);
            });
            layer.querySelector('[data-dialog-ok]')?.focus();
        });
    }
    const deviceLabel = d => d ? `${esc(d.name)} (${esc(d.device_uid)})` : 'Belum ada perangkat';
    function routeUrl(p) { const tab = p === 'admin' ? adminTab : p === 'user' ? userTab : ''; return '#/' + p + (tab ? '/' + tab : ''); }
    function syncUrl(p) { history.replaceState({}, '', routeUrl(p)); }
    function navigate(p) { page = p; loginError = ''; modal = null; syncUrl(p); render(); window.scrollTo(0,0); }
    window.addEventListener('hashchange', () => {
        const [,p,t] = (location.hash || '#/welcome').split('/');
        if (['welcome','login-admin','login-user','admin','user'].includes(p)) {
            page = p;
            if (p === 'admin' && ['users','devices','overview','profile'].includes(t)) adminTab = t;
            if (p === 'user' && ['home','monitoring','history','settings','profile'].includes(t)) userTab = t;
            if ((p==='admin'||p==='user') && !session) page='welcome';
            render();
        }
    });
    function landing() {
        return `<main class="welcome-layout">
    <section class="welcome-visual"><div class="welcome-top">${brand()}</div><div class="welcome-tagline"><h1>Air lebih cerdas.<br>Pertanian lebih baik.</h1><p>Pantau kondisi lahan dan kendalikan sistem penyiraman dalam satu platform yang sederhana dan responsif.</p></div></section>
    <section class="welcome-panel"><div class="welcome-inner"><div class="eyebrow">Selamat datang di iCare</div><h2>Masuk ke Sistem<br>Smart Irrigation</h2><p class="muted">Silakan pilih jenis akses sesuai akun Anda.</p>
    <button class="role-card" data-page="login-admin"><span class="role-icon admin">${icon('shield', 'xl')}</span><span><h3>Masuk sebagai Admin</h3><p>Kelola akun pengguna dan perangkat iCare</p></span><span class="role-arrow">${icon('chevron')}</span></button>
    <button class="role-card" data-page="login-user"><span class="role-icon">${icon('user', 'xl')}</span><span><h3>Masuk sebagai Pengguna</h3><p>Lihat contoh sensor, grafik, cuaca simulasi, dan kontrol pompa</p></span><span class="role-arrow">${icon('chevron')}</span></button>
    <div class="welcome-foot">© 2026 iCare · Smart Irrigation Dashboard</div></div></section></main>`;
    }
    function login(role) {
        const a = role === 'admin';
        return `<main class="login-layout"><section class="login-scene"><div class="scene-brand">${brand()}</div><div class="scene-label">Monitoring &amp; Smart Irrigation · Demo</div></section><section class="login-side"><div class="login-container">
        <a href="#/welcome" class="back-link" data-page="welcome">${icon('arrow-left','sm')} Kembali ke pilihan akses</a><div class="login-card">
        <div class="login-heading">${icon(a?'shield':'user')}<h1>Demo ${a?'Admin':'Pengguna'}</h1></div>
        <p class="login-sub">Jelajahi tampilan dan fitur simulasi ${a?'pengelolaan akun serta perangkat':'monitoring, grafik, dan kontrol pompa'}.</p>
        <div class="notice">MODE DEMO: tidak memerlukan username atau password. Jangan memasukkan kredensial akun sebenarnya.</div>
        <button type="button" class="grad-button full" data-demo-login="${role}">${icon('log-in','sm')} MASUK DEMO ${a?'ADMIN':'PENGGUNA'}</button></div><div class="login-tail">iCare · Demonstrasi antarmuka tanpa koneksi server</div></div></section></main>`;
    }
    function menuItem(tab, label, ic, active) { return `<button class="side-link ${tab === active ? 'active' : ''}" data-nav="${tab}">${icon(ic)} ${label}</button>`; }
    function mobileMenu(items, active) { return `<nav class="mobile-nav" aria-label="Menu utama">${items.map(x => `<button class="mobile-item ${x.id === active ? 'active' : ''}" data-nav="${x.id}">${icon(x.icon)}<span>${x.label}</span></button>`).join('')}</nav>`; }
    function frame(role, body) {
        const admin = role === 'admin';
        const items = admin ? [{ id: 'users', label: 'Pengguna', icon: 'users' }, { id: 'devices', label: 'Perangkat', icon: 'cpu' }, { id: 'overview', label: 'Ringkasan', icon: 'bars' }, { id: 'profile', label: 'Profil', icon: 'user' }] : [{ id: 'home', label: 'Beranda', icon: 'home' }, { id: 'monitoring', label: 'Monitoring', icon: 'bars' }, { id: 'history', label: 'Riwayat', icon: 'history' }, { id: 'settings', label: 'Pengaturan', icon: 'settings' }, { id: 'profile', label: 'Profil', icon: 'user' }];
        const active = admin ? adminTab : userTab;
        return `<div class="dashboard"><aside class="sidebar"><div class="sidebar-brand">${brand()}</div><div><div class="sidebar-section">${admin ? 'ADMINISTRASI' : 'MENU UTAMA'}</div><nav class="side-nav" style="margin-top:10px">${items.map(x => menuItem(x.id, x.label, x.icon, active)).join('')}</nav></div><div class="sidebar-bottom"><div class="sidebar-user"><div class="avatar">${admin ? 'A' : 'P'}</div><span><strong>${esc(session?.name || 'Pengguna')}</strong><small>${admin ? 'Akses pengelola' : 'Akses pengguna'}</small></span></div><button class="side-link" data-logout>${icon('log-out')} Keluar</button></div></aside>
    <main class="dashboard-main"><div class="mobile-head">${brand()}<button class="icon-button" data-logout title="Keluar">${icon('log-out')}</button></div><header class="topbar"><div class="topbar-welcome"><small>Dashboard / ${admin ? 'Administrator' : 'Pengguna'}</small><h2>${admin ? 'Pengelolaan Sistem iCare' : 'Selamat datang di iCare 🌱'}</h2></div><div class="top-actions"><button title="Segarkan data" class="icon-button" data-refresh>${icon('refresh')}</button><div class="top-avatar">${icon(admin ? 'shield' : 'user')}</div></div></header>${body}<footer class="footer-note">iCare · Smart Irrigation · Data simulasi · Tidak ada koneksi server </footer></main>${mobileMenu(items, active)}</div>${modal ? modalMarkup() : ''}`;
    }
    function headerStrip() { return `<section class="header-strip"><div class="header-title">${icon('sprout')}<div><strong>Dashboard IoT</strong><span>Penyiraman Pertanian DC</span></div></div><div class="network-pill ${state?.device?.online ? 'is-online' : 'is-offline'}">${icon('wifi')}<strong>${state?.device?.online ? 'TERHUBUNG' : 'OFFLINE'}<br><small>${esc(state?.device?.device_uid || 'Tidak ada perangkat')}</small></strong></div></section>${devices.length > 1 ? `<div class="device-picker card"><label>Perangkat: <select id="device-picker">${devices.map(d => `<option value="${d.id}" ${Number(d.id) === Number(selectedDevice) ? 'selected' : ''}>${deviceLabel(d)}</option>`).join('')}</select></label></div>` : ''}`; }
    function metrics() { const live = !!state?.device?.online && !!state?.device?.reading_fresh; const r = live ? (state?.reading || {}) : {}, w = state?.weather || {}; const vals = [['therm', 'Suhu Udara', r.temperature_c == null ? '—' : `${num(r.temperature_c)} °C`], ['droplet', 'Kelembapan Udara', r.humidity_rh == null ? '—' : `${num(r.humidity_rh)} % RH`], ['sprout', 'Kelembapan Tanah', r.soil_moisture_pct == null ? '—' : `${num(r.soil_moisture_pct)} %`], ['water-level', 'Ketinggian Air', r.water_level_pct == null ? '—' : `${num(r.water_level_pct)} %`], ['cloud', 'Cuaca Demo', w.text || 'Belum tersedia']]; return `<div class="metrics">${vals.map(([ic, label, value], i) => `<div class="metric card"><span class="metric-icon">${icon(ic, 'lg')}</span><div class="metric-name">${esc(label)}</div><div class="metric-value ${i === 4 ? 'weather' : ''}">${esc(value)}</div>${i < 4 && !live ? `<div class="metric-offline-hint">${state?.device?.online ? 'Menunggu pembacaan baru' : 'ESP32 offline'}</div>` : ''}</div>`).join('')}</div>`; }
    function graph(type) {
        const h = state?.history || [];
        if (!h.length)
            return `<div class="graph-empty">${icon('bars', 'lg')}<p>Belum ada data sensor untuk 24 jam terakhir</p></div>`;
        const width = 510, height = 190, x0 = 43, y0 = 10, w = 442, ph = 144;
        const points = h.slice(-90);
        const y = (v, min, max) => y0 + ph - (Number(v) - min) / (max - min) * ph;
        const draw = (key, min, max) => { const arr = points.map((p, i) => [i, p[key]]).filter(p => p[1] !== null && p[1] !== undefined); return arr.length > 1 ? arr.map(([i, v], j) => `${j ? 'L' : 'M'}${(x0 + i * w / Math.max(points.length - 1, 1)).toFixed(1)},${y(v, min, max).toFixed(1)}`).join(' ') : ''; };
        const soil = type === 'soil';
        const grid = Array.from({ length: 5 }, (_, i) => `<line x1="${x0}" y1="${y0 + i * ph / 4}" x2="${x0 + w}" y2="${y0 + i * ph / 4}" stroke="#e5eee6"/>`).join('');
        const timeLabels = [0, 1, 2, 3, 4].map(i => { const row = points[Math.round(i * (points.length - 1) / 4)]; return `<text x="${x0 + i * w / 4}" text-anchor="middle" y="${height - 8}" fill="#8da094" font-size="10">${esc(row?.recorded_at ? new Date(row.recorded_at.replace(' ', 'T') + 'Z').toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '')}</text>`; }).join('');
        const p1 = soil ? draw('soil_moisture_pct', 0, 100) : draw('temperature_c', 0, 50);
        const p2 = soil ? '' : draw('humidity_rh', 0, 100);
        return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Riwayat pengukuran sensor">${grid}${timeLabels}${p1 ? `<path d="${p1}" fill="none" stroke="${soil ? '#189b31' : '#ee9523'}" stroke-width="3" stroke-linejoin="round"/>` : ''}${p2 ? `<path d="${p2}" fill="none" stroke="#398af2" stroke-width="3"/>` : ''}</svg>`;
    }
    function graphCards() { return `<div class="chart-grid"><article class="chart-card card"><div class="chart-header"><div class="chart-heading">${icon('droplet', 'sm')} Riwayat Kelembapan Tanah</div><span class="small muted">24 Jam</span></div>${graph('soil')}<div class="chart-labels"><span><i class="key-dot"></i>Kelembapan Tanah (%)</span></div></article><article class="chart-card card"><div class="chart-header"><div class="chart-heading">${icon('therm', 'sm')} Riwayat Suhu &amp; Kelembapan Udara</div><span class="small muted">24 Jam</span></div>${graph('weather')}<div class="chart-labels"><span><i class="key-dot orange"></i>Suhu (°C)</span><span><i class="key-dot blue"></i>RH (%)</span></div></article></div>`; }
    function pumpCard() {
        const d = state?.device, cmd = state?.command;
        const pending = cmd && ['queued', 'sent'].includes(cmd.status);
        const online = !!d?.online;
        const known = online && d?.pump_on !== null && d?.pump_on !== undefined;
        const on = known && Boolean(Number(d.pump_on));
        const canControl = session?.role === 'admin' || !!devices.find(x => Number(x.id) === Number(d?.id))?.can_control;
        const enabled = online && known && !pending && canControl;
        const status = !online ? 'Perangkat offline' : pending ? 'Menunggu konfirmasi ESP32' : !known ? 'Status pompa belum tersedia' : 'Status pompa simulasi';
        const statusValue = !online || !known ? '—' : on ? 'ON' : 'OFF';
        // Jangan menonaktifkan klik sepenuhnya: pengguna mendapat penjelasan saat offline.
        // Backend tetap memblokir perintah saat perangkat offline.
        return `<article class="card status-card"><div class="status-left">${icon('pump', 'lg')}<div><strong>Pompa Utama</strong><small>${esc(status)} · ${statusValue}</small></div></div><button class="switch ${on ? 'on' : ''} ${!enabled ? 'is-unavailable' : ''}" data-pump role="switch" aria-checked="${on}" aria-disabled="${!enabled}" aria-label="Pompa Utama" title="${enabled ? 'Kirim perintah ON/OFF' : 'Klik untuk melihat alasan kontrol belum tersedia'}"><span></span></button></article>`;
    }
    function userHome() { const w = state?.weather || {}, online = !!state?.device?.online; return headerStrip() + metrics() + `<div class="status-row">${pumpCard()}<article class="card status-card"><div class="status-left">${icon('cloud', 'lg')}<div><strong>Informasi Cuaca (Simulasi)</strong><small>Prakiraan: ${esc(w.text || 'Belum tersedia')} · Data simulasi</small></div></div><span class="pill ${w.status === 'ok' ? 'green' : 'red'}">${w.status === 'ok' ? 'Tersedia' : 'Belum tersedia'}</span></article></div><section class="system-strip"><div class="status-left">${icon('wifi', 'lg')}<div><strong>Status Sistem</strong><p>${online ? 'Perangkat demo aktif (simulasi)' : 'Data mungkin tidak terkini, perangkat offline.'}</p></div></div><span class="pill ${online ? 'green' : 'red'}">${online ? 'Online' : 'Offline'}</span></section>${graphCards()}`; }
    function userContent() {
        if (userTab === 'home')
            return userHome();
        if (userTab === 'monitoring')
            return headerStrip() + `<div class="section-heading"><div><h3>Monitoring Sensor</h3><p>Data simulasi · Diperbarui setiap 5 detik</p></div></div>` + metrics() + `<div class="section-heading"><h3>Kontrol Pompa</h3></div><div class="status-row">${pumpCard()}</div>`;
        if (userTab === 'history')
            return `<div class="section-heading"><div><h3>Riwayat Pembacaan Sensor</h3><p>Data simulasi 24 jam terakhir · ekspor CSV demo</p></div><button class="outline-button" data-export-csv>Unduh CSV Riwayat</button></div>` + graphCards();
        if (userTab === 'settings')
            return `<div class="section-heading"><h3>Pengaturan Sistem</h3></div><div class="card detail-card profile-panel"><h3>Controller</h3><p>${esc(state?.device?.name || 'Belum ada perangkat')}</p><div class="divider"></div><h3>Pompa Utama</h3>${pumpCard()}<p class="notice">Semua kontrol pada halaman ini adalah simulasi dan tidak terhubung ke pompa sebenarnya.</p></div>`;
        return `<div class="section-heading"><h3>Profil Saya</h3></div><div class="card detail-card profile-panel"><div class="profile-row"><b>Nama</b><span>${esc(session?.name)}</span></div><div class="profile-row"><b>Username</b><span>${esc(session?.username)}</span></div><div class="profile-row"><b>Perangkat</b><span>${esc(state?.device?.name || 'Belum ditetapkan')}</span></div><div class="profile-row"><b>Hak akses</b><span>${esc(session?.role)}</span></div><div class="profile-actions"><span class="notice">Pengaturan password tidak tersedia pada Mode Demo.</span></div></div>`;
    }
    function adminSummary() { const act = users.filter(u => Number(u.is_active)).length; const connected = devices.filter(d => d.last_seen_at && Date.now() - Date.parse(d.last_seen_at.replace(' ', 'T') + 'Z') < 25000).length; return `<div class="admin-summary"><div class="stat-card card"><div><small>Total Pengguna</small><strong>${users.length}</strong></div><div class="stat-icon">${icon('users', 'lg')}</div></div><div class="stat-card card"><div><small>Pengguna Aktif</small><strong>${act}</strong></div><div class="stat-icon">${icon('check', 'lg')}</div></div><div class="stat-card card"><div><small>Total Perangkat</small><strong>${devices.length}</strong></div><div class="stat-icon">${icon('cpu', 'lg')}</div></div><div class="stat-card card"><div><small>Perangkat Online</small><strong>${connected}</strong></div><div class="stat-icon">${icon('wifi', 'lg')}</div></div></div>`; }
    function userTable() { const filtered = users.filter(u => `${u.name} ${u.username} ${u.email ?? ''}`.toLowerCase().includes(search.toLowerCase())); return `<div class="card admin-table-wrap"><table class="admin-table"><thead><tr><th>Pengguna</th><th>Username</th><th>Perangkat</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${filtered.length ? filtered.map(u => `<tr><td><div class="user-cell"><span class="user-circle">${esc(u.name[0]?.toUpperCase())}</span><span><strong>${esc(u.name)}</strong><small>${esc(u.email || '—')}</small></span></div></td><td>@${esc(u.username)}</td><td>${esc(u.device)}</td><td><span class="pill ${Number(u.is_active) ? 'green' : 'red'}">${Number(u.is_active) ? 'Aktif' : 'Nonaktif'}</span></td><td><div class="table-actions"><button class="table-action" data-edit="${u.id}" title="Edit pengguna">${icon('edit', 'sm')}</button><button class="table-action ${Number(u.is_active) ? 'off' : ''}" data-toggle-user="${u.id}" title="Ubah status pengguna">${icon('power', 'sm')}</button></div></td></tr>`).join('') : `<tr><td colspan="5"><div class="empty-state">Belum ada data pengguna yang sesuai.</div></td></tr>`}</tbody></table></div>`; }
    function adminContent() {
        const banner = `<section class="header-strip"><div class="header-title">${icon('shield', 'xl')}<div><strong>Dashboard Admin iCare</strong><span>Pengelolaan pengguna dan perangkat smart irrigation</span></div></div><span class="pill green" style="background:#fff">Administrator</span></section>`;
        if (adminTab === 'profile')
            return banner + `<div class="card detail-card profile-panel"><h3>Profil Administrator</h3><div class="profile-row"><b>Nama</b><span>${esc(session.name)}</span></div><div class="profile-row"><b>Username</b><span>${esc(session.username)}</span></div><div class="profile-row"><b>Hak akses</b><span>Admin</span></div><div class="profile-actions"><span class="notice">Pengaturan password tidak tersedia pada Mode Demo.</span></div></div>`;
        if (adminTab === 'devices')
            return banner + adminSummary() + `<div class="section-heading"><h3>Perangkat ESP32</h3><button class="grad-button" data-add-device>${icon('plus', 'sm')} Tambah Perangkat</button></div><section class="card admin-panel">${devices.length ? devices.map(d => `<div class="admin-device">${icon('cpu', 'lg')}<div><strong>${esc(d.name)}</strong><small>${esc(d.device_uid)} · ${esc(d.location_name || 'Lokasi belum diisi')}</small></div><span class="pill ${d.last_seen_at && Date.now() - Date.parse(d.last_seen_at.replace(' ', 'T') + 'Z') < 25000 ? 'green' : 'red'}">${d.last_seen_at && Date.now() - Date.parse(d.last_seen_at.replace(' ', 'T') + 'Z') < 25000 ? 'Online' : d.last_seen_at ? 'Offline' : 'Belum terhubung'}</span><button class="outline-button" style="margin-left:8px" data-rotate-key="${d.id}" title="Kunci lama tidak berlaku setelah diganti">Reset Kunci</button></div>`).join('') : 'Belum ada perangkat.'}</section>`;
        if (adminTab === 'overview')
            return banner + adminSummary();
        return banner + adminSummary() + `<div class="section-heading"><div><h3>Manajemen Pengguna</h3><p>Simulasikan tambah, ubah, dan nonaktifkan akun</p></div></div><div class="toolbar" style="margin-bottom:15px"><div class="muted small">${users.length} pengguna terdaftar</div><div class="toolbar-actions"><label class="search-wrap">${icon('search', 'sm')}<input id="user-search" type="search" placeholder="Cari pengguna..." value="${esc(search)}" aria-label="Cari pengguna"></label><button class="grad-button" data-add>${icon('plus', 'sm')} Tambah Pengguna</button></div></div>${userTable()}<section class="card admin-panel"><h3>Perangkat Terdaftar</h3>${devices.map(d => `<div class="admin-device">${icon('cpu', 'lg')}<div><strong>${esc(d.name)}</strong><small>${esc(d.device_uid)} · ESP32 · Pompa Utama</small></div></div>`).join('') || 'Belum ada perangkat.'}</section>`;
    }
    function modalMarkup() {
        if (modal?.type === 'password')
            return `<div class="modal-backdrop" data-overlay><div class="modal" role="dialog" aria-modal="true"><div class="modal-header"><span class="modal-head-icon">${icon('lock','lg')}</span><div class="modal-head-text"><small>KEAMANAN AKUN</small><h3>Ubah Password</h3></div><button class="close-btn" data-close aria-label="Tutup">${icon('close', 'sm')}</button></div><form data-password-form><div class="form-group"><label class="form-label">Password lama</label><input class="form-input" name="old_password" type="password" required autocomplete="current-password"></div><div class="form-group"><label class="form-label">Password baru (minimal 8 karakter)</label><input class="form-input" name="new_password" type="password" required minlength="8" autocomplete="new-password"></div><div class="form-group"><label class="form-label">Ulangi password baru</label><input class="form-input" name="confirm_password" type="password" required minlength="8" autocomplete="new-password"></div><div class="form-actions"><button class="outline-button" type="button" data-close>Batal</button><button class="grad-button" type="submit">Simpan Password</button></div></form></div></div>`;
        if (modal?.type === 'key')
            return `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true"><div class="modal-header"><span class="modal-head-icon">${icon('shield','lg')}</span><div class="modal-head-text"><small>KREDENSIAL PERANGKAT</small><h3>Kunci demo ${esc(modal.uid)}</h3></div></div><p>Ini hanya kunci contoh untuk simulasi, tidak boleh digunakan pada perangkat fisik.</p><div class="notice" style="overflow-wrap:anywhere;font-family:monospace" id="new-device-key">${esc(modal.key)}</div><div class="form-actions"><button class="outline-button" type="button" data-copy-device-key>Salin Kunci</button><button class="grad-button" type="button" data-close>Selesai</button></div></div></div>`;
        if (modal?.type === 'device')
            return `<div class="modal-backdrop" data-overlay><div class="modal" role="dialog" aria-modal="true"><div class="modal-header"><span class="modal-head-icon">${icon('cpu','lg')}</span><div class="modal-head-text"><small>REGISTRASI CONTROLLER</small><h3>Tambah Perangkat ESP32</h3></div><button class="close-btn" data-close>${icon('close', 'sm')}</button></div><form data-device-form><div class="form-group"><label class="form-label">Device UID (unik)</label><input class="form-input" name="device_uid" placeholder="DC-002" pattern="[A-Za-z0-9_-]{3,64}" required></div><div class="form-group"><label class="form-label">Nama perangkat</label><input class="form-input" name="name" placeholder="iCare DC-002" required></div><div class="form-group"><label class="form-label">Lokasi</label><input class="form-input" name="location_name" placeholder="Lokasi lahan"></div><div class="form-actions"><button class="outline-button" type="button" data-close>Batal</button><button class="grad-button" type="submit">Simpan</button></div></form></div></div>`;
        const u = modal?.type === 'edit' ? users.find(x => Number(x.id) === Number(modal.id)) : null;
        return `<div class="modal-backdrop" data-overlay><div class="modal" role="dialog" aria-modal="true" aria-label="${u ? 'Edit' : 'Tambah'} pengguna"><div class="modal-header"><span class="modal-head-icon">${icon('users','lg')}</span><div class="modal-head-text"><small>MANAJEMEN AKUN</small><h3>${u ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}</h3></div><button class="close-btn" data-close aria-label="Tutup">${icon('close', 'sm')}</button></div><form data-user-form="${u ? u.id : 'new'}">
    <div class="form-group"><label class="form-label">Nama lengkap</label><input class="form-input" name="name" value="${esc(u?.name || '')}" required maxlength="120"></div>
    <div class="form-grid"><div class="form-group"><label class="form-label">Username</label><input class="form-input" name="username" pattern="[A-Za-z0-9_-]{2,60}" value="${esc(u?.username || '')}" required></div><div class="form-group"><label class="form-label">Perangkat</label><select class="form-input" name="device_id"><option value="0">Belum ditetapkan</option>${devices.map(d => `<option value="${d.id}" ${Number(u?.device_id) === Number(d.id) ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div></div>
    <div class="form-group"><label class="form-label">Email (opsional)</label><input class="form-input" type="email" name="email" value="${esc(u?.email || '')}"></div>
    <div class="form-group"><label class="form-label">${u ? 'Password baru (kosongkan jika tidak diubah)' : 'Password awal (minimal 12 karakter)'}</label><input class="form-input" type="password" name="password" minlength="12" autocomplete="new-password" ${u ? '' : 'required'} placeholder="Minimal 12 karakter"></div>
    <div class="notice">Data akun demo hanya disimpan sementara dalam memori browser, bukan database.</div>
    <div class="form-actions"><button type="button" class="outline-button" data-close>Batal</button><button type="submit" class="grad-button">${icon('check', 'sm')} ${u ? 'Simpan Perubahan' : 'Tambah Pengguna'}</button></div></form></div></div>`;
    }
    function render() { root.innerHTML = page === 'welcome' ? landing() : page.startsWith('login-') ? login(page.replace('login-', '')) : page === 'admin' ? frame('admin', adminContent()) : frame('user', userContent()); if (modal) window.requestAnimationFrame(() => root.querySelector('.modal input, .modal button')?.focus()); }
    async function getDevices() { const res = await api('/api/devices'); devices = res.devices; if (!devices.some(d => Number(d.id) === Number(selectedDevice)))
        selectedDevice = Number(devices[0]?.id || 0); }
    async function getUsers() { if (session?.role === 'admin') {
        users = (await api('/api/users')).users;
    } }
    async function getState(redraw = true) { if (!session)
        return; try {
        state = await api('/api/state' + (selectedDevice ? `?device_id=${selectedDevice}` : ''));
        if (redraw && page === 'user' && !modal)
            render();
    }
    catch (e) {
        if (e.message.includes('login')) {
            session = null;
            navigate('welcome');
        }
        else {
            // Data lama tidak boleh tampil seolah masih terkoneksi ketika API gagal.
            state = null;
            if (redraw && page === 'user' && !modal) render();
            const now = Date.now();
            if (!getState.lastNoticeAt || now - getState.lastNoticeAt > 20000) {
                toast('Tidak dapat mengambil status perangkat: ' + e.message);
                getState.lastNoticeAt = now;
            }
        }
    } }
    async function loadDashboard() { loading = true; try {
        await getDevices();
        if (session?.role === 'admin')
            await getUsers();
        else
            await getState(false);
        navigate(session.role === 'admin' ? 'admin' : 'user');
    }
    catch (e) {
        toast(e.message);
    }
    finally {
        loading = false;
    } }
    document.addEventListener('click', async (e) => {
        const pg = e.target.closest('[data-page]');
        if (pg) {
            e.preventDefault();
            navigate(pg.dataset.page);
            return;
        }
        const demoLogin = e.target.closest('[data-demo-login]');
        if (demoLogin) {
            const role = demoLogin.dataset.demoLogin;
            session = {role, name: role === 'admin' ? 'Administrator Demo' : 'Pengguna Demo', username: role === 'admin' ? 'admin_demo' : 'pengguna_demo'};
            adminTab = 'overview'; userTab = 'home';
            await loadDashboard(); return;
        }
        if (e.target.closest('[data-show-pass]')) {
            const x = document.getElementById('password');
            if (x)
                x.type = x.type === 'password' ? 'text' : 'password';
            return;
        }
        if (e.target.closest('[data-forgot]')) {
            await confirmDialog({ title: 'Bantuan masuk akun', message: 'Silakan hubungi administrator iCare untuk mengatur ulang password akun Anda.', ok: 'Mengerti', iconName: 'lock', onlyOk: true });
            return;
        }
        if (e.target.closest('[data-refresh]')) {
            try {
                await getDevices();
                if (session?.role === 'admin')
                    await getUsers();
                else
                    await getState(false);
                render();
                toast('Data diperbarui.');
            }
            catch (err) {
                toast(err.message);
            }
            return;
        }
        if (e.target.closest('[data-logout]')) {
            try {
                const r = await api('/api/logout', 'POST', {});
                csrf = r.csrf;
            }
            catch { }
            session = null;
            users = [];
            devices = [];
            state = null;
            navigate('welcome');
            return;
        }
        const nav = e.target.closest('[data-nav]');
        if (nav) {
            if (page === 'admin') {
                adminTab = nav.dataset.nav;
                try {
                    await getUsers();
                    await getDevices();
                }
                catch { }
            }
            else {
                userTab = nav.dataset.nav;
                await getState(false);
            }
            syncUrl(page);
            render();
            window.scrollTo(0, 0);
            return;
        }
        if (e.target.closest('[data-pump]')) {
            if (!state?.device?.online) return toast('ESP32 offline. Tombol pompa baru bisa digunakan setelah perangkat terhubung.');
            if (state.device.pump_on === null || state.device.pump_on === undefined) return toast('Status pompa belum diterima dari ESP32.');
            if (state?.command && ['queued', 'sent'].includes(state.command.status)) return toast('Perintah sebelumnya masih menunggu konfirmasi ESP32.');
            if (session?.role !== 'admin' && !devices.find(x => Number(x.id) === Number(state.device.id))?.can_control) return toast('Akun ini tidak memiliki izin untuk mengontrol pompa.');
            const on = !Boolean(Number(state.device.pump_on));
            if (!await confirmDialog({ title: `Nyalakan pompa?`.replace('Nyalakan', on ? 'Nyalakan' : 'Matikan'), message: `Status pompa demonstrasi akan menjadi ${on ? 'ON' : 'OFF'}. Tidak ada perintah ke perangkat nyata.`, ok: on ? 'Ya, nyalakan' : 'Ya, matikan', iconName: 'pump', danger: !on }))
                return;
            try {
                const r = await api(`/api/devices/${state.device.id}/pump`, 'POST', { on });
                toast('Perintah tersimpan di MySQL; hanya simulasi, tidak mengendalikan ESP32.');
                await getState(false);
                render();
            }
            catch (err) {
                toast(err.message);
            }
            return;
        }
        const rotate = e.target.closest('[data-rotate-key]');
        if (rotate) {
            const id = Number(rotate.dataset.rotateKey);
            if (!await confirmDialog({ title: 'Reset kunci perangkat?', message: 'Hanya simulasi reset kunci; tidak memengaruhi perangkat apa pun.', ok: 'Reset kunci', iconName: 'shield', danger: true }))
                return;
            try {
                const result = await api(`/api/devices/${id}/rotate-key`, 'POST', {});
                modal = { type: 'key', uid: result.device_uid, key: result.device_key };
                render();
            }
            catch (err) {
                toast(err.message);
            }
            return;
        }
        if (e.target.closest('[data-copy-device-key]')) {
            try {
                await navigator.clipboard.writeText(modal?.key || '');
                toast('Kunci perangkat disalin.');
            }
            catch {
                toast('Silakan blok dan salin kunci secara manual.');
            }
            return;
        }
        if (e.target.closest('[data-change-password]')) {
            modal = { type: 'password' };
            render();
            return;
        }
        if (e.target.closest('[data-export-csv]')) {
            const h = mockHistory();
            const headers = ['recorded_at','temperature_c','humidity_rh','soil_moisture_pct','water_level_pct'];
            const csv = [headers.join(','),...h.map(r=>headers.map(k=>r[k]).join(','))].join('\r\n');
            const file = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'});
            const url = URL.createObjectURL(file); const a=document.createElement('a'); a.href=url; a.download='icare-riwayat-demo.csv';a.click();
            setTimeout(()=>URL.revokeObjectURL(url),1000);
            toast('CSV berisi data simulasi telah diunduh.');
            return;
        }
        if (e.target.closest('[data-add]')) {
            modal = { type: 'add' };
            render();
            return;
        }
        if (e.target.closest('[data-add-device]')) {
            modal = { type: 'device' };
            render();
            return;
        }
        const ed = e.target.closest('[data-edit]');
        if (ed) {
            modal = { type: 'edit', id: Number(ed.dataset.edit) };
            render();
            return;
        }
        const tg = e.target.closest('[data-toggle-user]');
        if (tg) {
            const u = users.find(x => Number(x.id) === Number(tg.dataset.toggleUser));
            if (!u)
                return;
            const active = !Boolean(Number(u.is_active));
            if (!await confirmDialog({ title: `${active ? 'Aktifkan' : 'Nonaktifkan'} akun pengguna?`, message: `Akun ${u.name} akan ${active ? 'diberi akses kembali' : 'dinonaktifkan dan tidak dapat masuk ke website'}.`, ok: active ? 'Aktifkan akun' : 'Nonaktifkan akun', iconName: 'user', danger: !active }))
                return;
            try {
                await api(`/api/users/${u.id}/status`, 'PATCH', { active });
                await getUsers();
                render();
                toast('Status pengguna demo diperbarui (simulasi).');
            }
            catch (err) {
                toast(err.message);
            }
            return;
        }
        if (e.target.closest('[data-close]') || e.target.matches('[data-overlay]')) {
            modal = null;
            render();
        }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal?.type !== 'key') { modal = null; render(); } });
    document.addEventListener('change', async (e) => { if (e.target.id === 'device-picker') {
        selectedDevice = Number(e.target.value);
        await getState(false);
        render();
    } });
    document.addEventListener('input', e => { if (e.target.id === 'user-search') {
        search = e.target.value;
        const table = document.querySelector('.admin-table-wrap');
        if (table)
            table.outerHTML = userTable();
    } });
    // Dukungan Enter pada login admin/pengguna, perubahan password, dan form admin.
    // Fokus berpindah ke input berikutnya; input terakhir mengirim form secara normal.
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing || e.repeat || e.defaultPrevented) return;
        const field = e.target;
        if (!(field instanceof HTMLInputElement)) return;
        const form = field.closest('form');
        if (!form || !form.matches('[data-login-form], [data-password-form], [data-user-form], [data-device-form]')) return;
        if (field.disabled || field.readOnly || ['button', 'submit', 'checkbox', 'radio', 'file'].includes(field.type)) return;

        e.preventDefault();
        const fields = [...form.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])')]
            .filter(input => !input.disabled && !input.readOnly && input.getClientRects().length > 0);
        const pos = fields.indexOf(field);
        const next = fields.slice(pos + 1).find(input => input.required && !input.value.trim());
        if (next) { next.focus(); return; }
        // Di dialog ubah password, Enter pada dua kolom awal maju ke kolom berikutnya.
        if (form.matches('[data-password-form]') && pos >= 0 && pos < fields.length - 1) {
            fields[pos + 1].focus();
            return;
        }
        // Login: Enter pada username memindahkan kursor ke kolom password.
        if (form.matches('[data-login-form]') && field.name === 'username') {
            const password = form.querySelector('input[name="password"]');
            if (password) { password.focus(); return; }
        }
        form.requestSubmit(); // Menjalankan validasi browser dan handler submit yang tersedia.
    });
    document.addEventListener('submit', async (e) => {
        const f = e.target;
        if (f.matches('[data-login-form]')) {
            e.preventDefault();
            const d = new FormData(f);
            try {
                const r = await api('/api/login', 'POST', { role: f.dataset.loginForm, username: String(d.get('username') || ''), password: String(d.get('password') || '') });
                csrf = r.csrf;
                session = r.user;
                adminTab = 'users';
                userTab = 'home';
                await loadDashboard();
            }
            catch (err) {
                loginError = err.message;
                render();
                toast(err.message, 'error');
            }
            return;
        }
        if (f.matches('[data-password-form]')) {
            e.preventDefault();
            const d = new FormData(f);
            const old = String(d.get('old_password') || '');
            const fresh = String(d.get('new_password') || '');
            if (fresh !== String(d.get('confirm_password') || ''))
                return toast('Konfirmasi password tidak cocok.');
            try {
                const r = await api('/api/password', 'POST', { old_password: old, new_password: fresh });
                csrf = r.csrf;
                modal = null;
                render();
                toast('Simulasi perubahan password berhasil. Tidak ada password asli yang berubah.');
            }
            catch (err) {
                toast(err.message);
            }
            return;
        }
        if (f.matches('[data-user-form]')) {
            e.preventDefault();
            const d = new FormData(f), id = f.dataset.userForm;
            const payload = { name: String(d.get('name') || '').trim(), username: String(d.get('username') || '').trim(), email: String(d.get('email') || '').trim(), password: String(d.get('password') || ''), device_id: Number(d.get('device_id') || 0) };
            try {
                await api(id === 'new' ? '/api/users' : `/api/users/${id}`, id === 'new' ? 'POST' : 'PATCH', payload);
                modal = null;
                await getUsers();
                render();
                toast('Akun simulasi berhasil diperbarui (hanya selama sesi halaman ini).');
            }
            catch (err) {
                toast(err.message);
            }
            return;
        }
        if (f.matches('[data-device-form]')) {
            e.preventDefault();
            const d = new FormData(f);
            try {
                const result = await api('/api/devices', 'POST', { device_uid: String(d.get('device_uid') || ''), name: String(d.get('name') || ''), location_name: String(d.get('location_name') || '') });
                modal = { type: 'key', uid: result.device_uid, key: result.device_key };
                await getDevices();
                render();
                toast('Perangkat terdaftar. Simpan kunci ESP32 sekarang.');
            }
            catch (err) {
                toast(err.message);
            }
        }
    });
    async function boot() { try {
        const r = await api('/api/session');
        csrf = r.csrf;
        session = r.user;
        if (session)
            await loadDashboard();
        else if (page === 'admin')
            navigate('login-admin');
        else if (page === 'user')
            navigate('login-user');
        else
            render();
    }
    catch (e) {
        root.innerHTML = `<main class="welcome-panel" style="min-height:100vh;padding:40px"><div class="login-card"><h2>Server belum siap</h2><p>${esc(e.message)}</p><p>Pastikan MySQL aktif dan file .env telah dikonfigurasi. Lihat README.md.</p></div></main>`;
    } }
    setInterval(async () => { if (session && page === 'user' && !modal && !loading)
        await getState(); }, 5000);
    if (location.hash === '#/login-admin' || location.hash === '#/login-user') page=location.hash.slice(2);
    boot();
})();
