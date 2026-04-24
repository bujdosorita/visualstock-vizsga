// =========================================================================
// 1. BACKEND API KAPCSOLAT
// =========================================================================
// Közvetlen Supabase elérés helyett biztonságos Edge Function réteget használunk
const API_URL = "https://ktmmhgmfzfqbwianrsbx.supabase.co/functions/v1";

// =========================================================================
// 2. GLOBÁLIS ÁLLAPOTTÉR (State)
// =========================================================================
// Az alkalmazás kliensoldali memóriája és vezérlő változói
const appDiv = document.getElementById('app'); 
const searchInput = document.getElementById('searchInput'); 
let termekek = []; // A szerverről szinkronizált termékadatok kliensoldali gyorsítótára
let aktualisSzuro = 'all'; // Az aktív kategóriaszűrő (view state)
let utolsoModositas = 0; // Utolsó felhasználói interakció időbélyege (versenyhelyzet / polling conflict elkerülésére)
let cardTimers = {}; // Animáció vezérlők (kártya rotáció timeout referenciái)
let lastSyncTime = null; // Utolsó sikeres adatszinkronizáció időbélyege


// =========================================================================
// 3. JOGOSULTSÁGKEZELÉS (Auth & RBAC)
// =========================================================================
let currentUser = null; // Aktuális session adatok (id, név, role)
let lastActivity = Date.now(); // Utolsó felhasználói aktivitás időbélyege (inaktivitás figyeléshez)
let pendingChanges = {}; // Kliensoldali batch tranzakciós verem (mentésre váró módosítások)

// --- Hitelesítési Logika ---
// A jelszó titkosítása és validálása a biztonság érdekében a Backend rétegen (Edge Function) történik.

async function handleLogin() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('loginPassword').value.trim();
    const errorEl = document.getElementById('loginError');
    
    // Alapvető kliensoldali input validáció
    if (!user || !pass) {
        errorEl.innerText = "Kérlek tölts ki minden mezőt!";
        return; 
    }

    try {
        // Hitelesítési API kérés indítása (Auth)
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        
        const result = await response.json();

        if (!response.ok) {
            // Biztonsági okokból szándékosan általános hibaüzenet (Schliemann elv)
            errorEl.innerText = result.error || "Hibás adatok vagy jelszó!"; 
        } else {
            // Sikeres hitelesítés kezelése
            loginSuccess({ id: result.user.id, name: result.user.username, role: result.user.role });
        }
    } catch (e) {
        console.error("Login hiba:", e);
        errorEl.innerText = "Hiba történt a bejelentkezés során!";
    }
}

// --- Regisztrációs Logika ---
async function handleRegister() {
    const user = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPassword').value.trim();
    const errorEl = document.getElementById('regError');
    
    // Kliensoldali input validáció
    if (!user || !email || !pass) {
        errorEl.innerText = "Kérlek tölts ki minden mezőt!"; return;
    }
    if (!email.includes('@')) {
        errorEl.innerText = "Érvénytelen e-mail cím!"; return;
    }
    if (user.toLowerCase() === 'admin') {
        errorEl.innerText = "Az 'admin' név foglalt/védett!"; return;
    }

    try {
        // Regisztrációs payload beküldése az Edge Function-nek
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, email: email, password: pass })
        });
        
        const result = await response.json();

        if (!response.ok) {
            console.error("Regisztrációs API hiba:", result);
            // Kód '23505': UNIQUE constraint violation a Postgres SQL-ben 
            if (result.code === '23505') errorEl.innerText = "A név vagy e-mail már létezik!";
            else errorEl.innerText = "Szerver hiba: " + (result.error || "Ismeretlen hiba");
        } else {
            alert("Sikeres regisztráció! Most már bejelentkezhetsz.");
            toggleLoginView('login'); 
        }
    } catch (e) {
        console.error("Regisztrációs kliens hiba:", e);
        errorEl.innerText = "Hiba történt: " + e.message;
    }
}

// =========================================================================
// 4. FELHASZNÁLÓI FELÜLET (UI) VEZÉRLŐK
// =========================================================================

// Jelszómező vizuális kapcsolója (plaintext / rejtett)
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.parentElement.querySelector('.password-toggle');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('ph-eye', 'ph-eye-slash'); 
    } else {
        input.type = 'password';
        icon.classList.replace('ph-eye-slash', 'ph-eye');
    }
}

// Interfész váltó: Login / Regisztráció nézet
function toggleLoginView(view) {
    const loginForm = document.getElementById('loginFormView');
    const regForm = document.getElementById('regFormView');
    const loginError = document.getElementById('loginError');
    const regError = document.getElementById('regError');

    if (view === 'reg') {
        loginForm.style.display = 'none'; 
        regForm.style.display = 'block';  
        regError.innerText = "";
        
        // Memória ürítése váltáskor biztonsági okokból
        const fields = ['regUsername', 'regEmail', 'regPassword'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });
        
        const passEl = document.getElementById('regPassword');
        if (passEl) {
            passEl.type = 'password';
            const icon = passEl.parentElement.querySelector('.password-toggle');
            if (icon) icon.classList.replace('ph-eye-slash', 'ph-eye');
        }
    } else {
        loginForm.style.display = 'block'; 
        regForm.style.display = 'none';    
        loginError.innerText = "";
    }
}

// Sikeres hitelesítés és munkafolyamat indítása
function loginSuccess(session) {
    console.log("Sikeres belépés:", session.name);
    
    // Auth Session rögzítése persistencia (F5 újratöltés) biztosításához
    currentUser = session;
    
    // CSAK akkor állítunk be új kezdőidőpontot, ha még nincs (pl. friss login)
    // Így az oldalfrissítés nem nullázza le a biztonsági időkorlátokat
    const sessionStart = session.sessionStart || Date.now();
    const sessionWithTime = { ...session, sessionStart: sessionStart };
    localStorage.setItem('vs_session', JSON.stringify(sessionWithTime));
    lastActivity = Date.now(); // Aktivitás frissítése belépéskor
    
    // UI layout módosítása: bejelentkező overlay elrejtése
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('userNameDisplay').innerText = session.name;
    appDiv.innerHTML = ""; 
    
    // DOM-szintű RBAC felülírás (Role-based UI access)
    // CSS namespace szabályozza a komponensek (.admin-only) láthatóságát
    document.body.classList.remove('role-admin', 'role-editor', 'role-reader');
    document.body.classList.add('role-' + session.role);
    
    // Kezdőállapot szinkronizálása a szerverről
    fetchProducts(true); 
}

// Munkamenet lezárása (Logout)
function handleLogout() {
    currentUser = null; 
    localStorage.removeItem('vs_session'); // Cache ürítése
    document.body.classList.remove('role-admin', 'role-editor', 'role-reader'); // Jogosultságok megvonása az interfésztől
    document.getElementById('loginOverlay').style.display = 'flex'; 
    document.getElementById('userNameDisplay').innerText = "Belépés";
    
    // Input mezők scrubbolása (Szenzitív adatok memória-mentesítése)
    const fields = ['username', 'loginPassword', 'regUsername', 'regEmail', 'regPassword'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.value = "";
            if (el.type === 'text' && (id === 'loginPassword' || id === 'regPassword')) {
                el.type = 'password'; 
                const icon = el.parentElement.querySelector('.password-toggle');
                if (icon) icon.classList.replace('ph-eye-slash', 'ph-eye');
            }
        }
    });
    
    // UI state visszaállítása és a kliensoldali tranzakció-verem (batch) törlése
    document.getElementById('loginError').innerText = "";
    document.getElementById('regError').innerText = "";
    appDiv.innerHTML = ""; 
    pendingChanges = {}; 
    updatePendingBadge();
}

// Session újraélesztés az oldal újratöltésekor (Persistence Check)
function checkSession() {
    try {
        const saved = localStorage.getItem('vs_session'); 
        if (saved) {
            loginSuccess(JSON.parse(saved)); 
        } else {
            const overlay = document.getElementById('loginOverlay');
            if (overlay) overlay.style.display = 'flex'; 
        }
    } catch (e) {
        // Fallback: Ha sérült a storage JSON, bekérjük újra a hitelesítést
        const overlay = document.getElementById('loginOverlay');
        if (overlay) overlay.style.display = 'flex';
    }
}

// UI fejléc óra rendering
function updateClock() {
    const now = new Date(); 
    const clockEl = document.getElementById('clock');
    if (clockEl) {
        clockEl.innerText = now.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
    }
    checkSecurityLimits(); // Időalapú policy ellenőrzés futtatása
}

// --- Biztonsági korlátok: Automatikus kijelentkezés és Inaktivitás ---
function checkSecurityLimits() {
    if (!currentUser) return;

    const now = new Date();
    
    // 1. INAKTIVITÁSI KORLÁT (3 óra = 3 * 60 * 60 * 1000 ms)
    const IDLE_LIMIT = 3 * 60 * 60 * 1000; 
    if (Date.now() - lastActivity > IDLE_LIMIT) {
        console.warn("Biztonsági korlát: Inaktivitás miatt automatikus kijelentkezés (3 óra).");
        handleLogout();
        return;
    }

    // 2. MUNKAIDŐ VÉGE (17:00) KORLÁT
    // Lekérjük mikor lépett be a felhasználó eredetileg
    const saved = localStorage.getItem('vs_session');
    if (!saved) return;
    const sessionData = JSON.parse(saved);
    const sessionStart = new Date(sessionData.sessionStart);
    
    // Kiszámítjuk, mikor volt a legutóbbi 17:00
    const last17 = new Date();
    last17.setHours(17, 0, 0, 0);
    if (now.getHours() < 17) {
        last17.setDate(last17.getDate() - 1); // Ha ma még nincs 17:00, akkor tegnap 17:00 volt a határ
    }

    // Ha a bejelentkezés a legutóbbi 17:00 ELŐTT történt, a session érvénytelen
    if (sessionStart < last17) {
        console.warn("Biztonsági korlát: Munkaidő lejárt (17:00), automatikus kijelentkezés.");
        handleLogout();
    }
}

// =========================================================================
// 5. A FŐ KEZDŐLAP ("IRÁNYÍTÓPULT" VAGY "DASHBOARD") MEGÉPÍTÉSE
// =========================================================================
// Ez a függvény rajzolja ki azt az oldalt, ahol a statisztikák vannak 
// (pl. Összes Termék, Kritikus Készlet, Kasszaszalagok)
function renderDashboard() {
    aktualisSzuro = 'dashboard'; // Megjegyezzük hogy itt vagyunk
    appDiv.classList.remove('grid-container'); // Mivel ez nem egy kártya-rács, levesszük a css szabályt
    

    // Kritikus állomány számítása: <20% lefedettség vagy készlethiány
    const lowStockItems = termekek.filter(t => {
        let sz = t.max > 0 ? (t.db / t.max) * 100 : 0; 
        return sz < 20 || t.db <= 0;
    });

    // Indikátor aggregációk (KPI)
    const totalItems = termekek.length; 
    const criticalCount = lowStockItems.length; 
    const kasszaCount = termekek.filter(t => getTermekCategory(t) === 'kasszaszalag').length;

    // VDOM-szerű optimalizált frissítés (Smooth Update Layout)
    // A teljes újra-renderelés elkerülésével minimalizálja a reflow/repaint költségeket
    const isDashboardOpen = document.querySelector('.stats-grid');
    if (isDashboardOpen) {
        const existingDash = document.querySelector('.dashboard-container');
        const welcomeH2 = existingDash ? existingDash.querySelector('.dashboard-welcome h2') : null;
        if (welcomeH2) welcomeH2.innerText = `Üdvözlünk, ${currentUser.name}!`;

        const valTotal = document.getElementById('stat-total-val');
        const valCrit = document.getElementById('stat-crit-val');
        const valKassza = document.getElementById('stat-kassza-val');
        const valSync = document.getElementById('last-sync-time');
        if (valTotal) valTotal.innerText = totalItems;
        if (valCrit) valCrit.innerText = criticalCount;
        if (valKassza) valKassza.innerText = kasszaCount;
        if (valSync) valSync.innerText = lastSyncTime || '--:--:--';
        return; 
    }

    // Navigációs aktív státusz reset
    document.querySelectorAll('.category-buttons button').forEach(b => b.classList.remove('active-btn')); 

    // Általános HTML DOM generálás
    let html = `
        <div class="dashboard-container">
            <div class="dashboard-welcome">
                <h2>Üdvözlünk, ${currentUser.name}!</h2>
                <div class="sync-status">
                    <i class="ph-bold ph-arrows-clockwise"></i>
                    <span>Utolsó készlet lekérés: <strong id="last-sync-time">${lastSyncTime || '--:--:--'}</strong></span>
                </div>
            </div>
            <div class="stats-grid">
                <div class="stat-card" onclick="filterCategory('all')">
                    <div class="stat-icon"><i class="ph-fill ph-package"></i></div>
                    <div class="stat-info">
                        <span class="stat-value" id="stat-total-val">${totalItems}</span>
                        <span class="stat-label">Összes Termék</span>
                    </div>
                </div>
                <div class="stat-card critical" onclick="filterCritical()">
                    <div class="stat-icon"><i class="ph-fill ph-warning-octagon"></i></div>
                    <div class="stat-info">
                        <span class="stat-value" id="stat-crit-val">${criticalCount}</span>
                        <span class="stat-label">Kritikus Készlet</span>
                    </div>
                </div>
                <div class="stat-card accent" onclick="filterCategory('kasszaszalag')">
                    <div class="stat-icon"><i class="ph-fill ph-receipt"></i></div>
                    <div class="stat-info">
                        <span class="stat-value" id="stat-kassza-val">${kasszaCount}</span>
                        <span class="stat-label">Kasszapapírok</span>
                    </div>
                </div>
            </div>
            
            <div class="dashboard-actions">
                <h3>Gyorsműveletek</h3>
                <div class="quick-links">
                    <button onclick="filterCategory('all')"><i class="ph-bold ph-magnifying-glass"></i> Termékek böngészése</button>
                    ${currentUser.role === 'admin' || currentUser.role === 'editor' ? '<button onclick="simulateSync()"><i class="ph-bold ph-arrows-clockwise"></i> Adatok frissítése</button>' : ''}
                    ${currentUser.role === 'admin' ? '<button onclick="renderHistory()" class="btn-history"><i class="ph-bold ph-clock-counter-clockwise"></i> Napló</button>' : ''}
                </div>
            </div>
        </div>
    `;
    appDiv.innerHTML = html; 
}


// =========================================================================
// 6. ADATBÁZIS (TERMÉKEK) SZINKRONIZÁCIÓ (Polling)
// =========================================================================

// Fő adatszinkronizáló ciklus, amely meghatározott időközönként frissíti a lokális cache-t
async function fetchProducts(showDashboard = false) {

    if (!currentUser) return;

    // Optimista zárolás (Throttling): Ha friss manuális módosítás történt, 
    // kihagyjuk a polling ciklust a felülírás megakadályozása érdekében.
    if (Date.now() - utolsoModositas < 2000) return;
    
    try {
        // API kérés az adathalmazra (Edge Function réteg felé)
        const response = await fetch(`${API_URL}/products`);
        if (!response.ok) throw new Error('Nem sikerült letölteni a termékeket az API-tól.');
        
        const result = await response.json();
        const data = result.products;

        // Adattranszformáció: API response adatmodell átalakítása a kliens architektúrájára
        const formataltAdatok = data.map(t => ({
            cikkszam: String(t.cikkszam),
            nev: t.nev,
            // PROFI VÉDELEM: Ha van be nem küldött módosítás, azt mutassa, ha nincs, akkor a felhős adatot!
            db: pendingChanges[String(t.cikkszam)] !== undefined ? pendingChanges[String(t.cikkszam)] : Math.max(0, parseInt(t.db)),
            max: parseInt(t.max_keszlet),    // Átalakítjuk a szöveget (szöveges szám) igazi számmá  (parseInt)
            kep: t.kep || null               // Ha nincs neki külön kép, null lesz.
        }));

        termekek = formataltAdatok; // Beletesszük a fenti közös "nagydobozba"
        lastSyncTime = new Date().toLocaleTimeString('hu-HU'); // Rögzítjük az időt az Irányítópulton
        
        // --- Eldöntjük mit mutassunk meg a képernyőn ---
        // 1. Ha a kolléga épp keresett valamit (ne zavarjunk be neki a kezdőképernyővel)
        if (searchInput.value.length > 0) {
            filterStock(); // Keresés újra-lejátszása a legújabb adatokkal
        } else if (showDashboard || aktualisSzuro === 'dashboard') {
            // 2. Ha eddig Dashboardon volt, azt frissitjük
            renderDashboard();
        } else {
            // 3. Ha mondjuk a "Pénztárgépszalagok" gombnál járt, azt építjük újra.
            handleUpdate(formataltAdatok);
        }
    } catch (error) {
        // Ha valami nagyon félremegy internet/szerver szinten.
        console.error('Supabase hiba:', error);
        
        // BEBIZTOSÍTÁS: Ha sosem tudnánk semmit se letölteni az adatbázisból, betöltünk 3 kamu kártyát,
        // hogy legalább látszódjon a design és ne legyen fehér képernyő (jól jön prezentáláskor ha halott a net)
        if (termekek.length === 0) {
            loadDemoData(); // Betölti a próba adatokat
            if (showDashboard) renderDashboard();
        }
    }
}

// Ha a szerver nem válaszol, de a bemutatót meg kell tartani, ez ment meg minket!
function loadDemoData() {
    console.warn("DEMO mód aktiválva.");
    const ujAdatok = [
        { nev: "100cm Kihúzható Ruhatartó Sztender Ipari Görgővel", cikkszam: "601056", db: 11, max: 20 },
        { nev: "122cm Fekete Ipari Ruhatartó Sztender", cikkszam: "6010414FT", db: 5, max: 10 },
        { nev: "44cm Csíptetős Ing Fa Vállfa", cikkszam: "402616", db: 1475, max: 1800 }
    ];
    handleUpdate(ujAdatok);
}

// Az adatfrissítés utolsó lépése: eldönti ismét a program, hogy melyik fület (kategóriát) akarta nézni eddig a user
function handleUpdate(ujAdatok) {
    termekek = ujAdatok;
    if (searchInput.value.length > 0) {
        filterStock();
    } else if (aktualisSzuro === 'dashboard') {
        renderDashboard();
    } else if (aktualisSzuro === 'critical') {
        filterCritical();
    } else if (aktualisSzuro === 'history') {
        // Ha a history nézeten volt, csendben (villogás nélkül) háttérfrissítjük a naplót
        renderHistory(true);
    } else {
        filterCategory(aktualisSzuro, false);
    }
}


// =========================================================================
// 7. RAKTÁRKÉSZLET MÓDOSÍTÁS (DOM & Tranzakció építés)
// =========================================================================

// Relatív (+/-) készletváltoztatás a kliens cache-ben
async function modifyStock(cikkszam, valtozas) {
    // RBAC: Hitelesítési (Auth) és szerepkör (Authorization) ellenőrzése a kliens oldalon
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'editor')) return; 
    
    // Polling zárolás / race condition elkerülése
    utolsoModositas = Date.now();
    
    // Céltermék azonosítása az in-memory adatstruktúrában
    const termekIndex = termekek.findIndex(t => String(t.cikkszam) === String(cikkszam));
    if (termekIndex === -1) {
        console.error("Nem talalhato termek index! Cikkszam:", cikkszam);
        return; 
    }

    // Constraint: Készlet nem lehet negatív (0-s alsó korlát)
    const ujKeszlet = Math.max(0, termekek[termekIndex].db + valtozas);

    // Határvédelem: Üzleti logika szerint a készlet nem mehet nulla alá
    if (termekek[termekIndex].db + valtozas < 0) {
        console.warn(`Figyelem! Negatív készlet nem engedélyezett.`);
    }

    termekek[termekIndex].db = ujKeszlet; 
    
    // Sorba állítás bulk update-hez (Batching)
    pendingChanges[cikkszam] = ujKeszlet;
    updatePendingBadge(); 

    // Célzott DOM frissítés újragenerálás nélkül (Performance Optimization)
    const cardEl = document.querySelector(`.card-container[data-cikkszam="${cikkszam}"]`);
    if (cardEl) {
        const t = termekek[termekIndex];
        let sz = t.max > 0 ? Math.round((t.db / t.max) * 100) : 0;
        if (sz > 100) sz = 100;
        
        let sCl = 'stock-high'; let tCl = 'text-green';
        if (sz < 40) { sCl = 'stock-med'; tCl = 'text-yellow'; }
        if (sz < 20 || t.db <= 0) { sCl = 'stock-low'; tCl = 'text-red'; }
        
        const qS = cardEl.querySelector('.current-qty');
        const fD = cardEl.querySelector('.progress-fill');
        
        if (qS) { qS.innerText = t.db; qS.className = `current-qty ${tCl}`; }
        if (fD) { fD.style.width = `${sz}%`; fD.className = `progress-fill ${sCl}`; }
    }
}

// --- MANUÁLIS KÉSZLET MÓDOSÍTÁS (Input Mező) ---
// Szabadkezes bevitel a raktárkészlet közvetlen felülírására
async function setManualStock(cikkszam, ertek) {
    // RBAC: Jogosultság ellenőrzése
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'editor')) return;
    
    utolsoModositas = Date.now();

    // Referencia validáció a kliens cache-ben
    const termekIndex = termekek.findIndex(t => String(t.cikkszam) === String(cikkszam));
    if (termekIndex === -1) return; 

    // Típus-konverzió és adat ellenőrzés
    let ujKeszlet = parseInt(ertek);
    if (isNaN(ujKeszlet)) return; 
    
    // Bemeneti validáció: Negatív érték automatikus korrekciója
    if (ujKeszlet < 0) {
        ujKeszlet = 0;
        console.warn(`Negatív érték korrigálva 0-ra.`);
    }

    // Tranzakciós várakozó lista (pool) frissítése
    termekek[termekIndex].db = ujKeszlet;
    pendingChanges[cikkszam] = ujKeszlet;
    
    updatePendingBadge();

    // Mutáció következményeként DOM update renderelése
    const cardEl = document.querySelector(`.card-container[data-cikkszam="${cikkszam}"]`);
    if (cardEl) {
        const t = termekek[termekIndex];
        let sz = t.max > 0 ? Math.round((t.db / t.max) * 100) : 0;
        if (sz > 100) sz = 100; 
        
        let sCl = 'stock-high'; let tCl = 'text-green';
        if (sz < 40) { sCl = 'stock-med'; tCl = 'text-yellow'; }
        if (sz < 20 || t.db <= 0) { sCl = 'stock-low'; tCl = 'text-red'; }
        
        const qS = cardEl.querySelector('.current-qty');
        const fD = cardEl.querySelector('.progress-fill');
        
        if (qS) { qS.innerText = t.db; qS.className = `current-qty ${tCl}`; }
        if (fD) { fD.style.width = `${sz}%`; fD.className = `progress-fill ${sCl}`; }
    }
}

// UI Badge frissítése a lokális (dirty) rekordok számával
function updatePendingBadge() {
    const count = Object.keys(pendingChanges).length; 
    const btn = document.getElementById('btnBulkSave');
    const badge = document.getElementById('pendingCount');
    if (btn && badge) {
        badge.innerText = count;
        // Gomb állapot menedzsment: Nincs pending = disable
        btn.disabled = count === 0; 
    }
}

// Bulk tranzakció előtti megerősítő / Védelmi réteg
function confirmBulkUpdate() {
    const count = Object.keys(pendingChanges).length;
    if (count === 0) return; 
    
    // Személyre szabott Action Modal behívása
    const overlay = document.getElementById('confirmOverlay');
    const message = document.getElementById('confirmMessage');
    const btnOk = document.getElementById('btnConfirmOk');
    const btnCancel = document.getElementById('btnConfirmCancel');
    
    // Dinamikus tartalom generálás
    message.innerHTML = `Biztosan módosítani kívánja a(z) <span style="color: var(--accent-orange); font-size: 1.3rem; font-weight: bold;">${count}</span> termék adatait?`;
    
    overlay.style.display = 'flex';
    
    // Proceed flow
    btnOk.onclick = function() {
        overlay.style.display = 'none';
        saveBulkChanges(); // Tranzakció indítása
    };
    
    // Cancel flow
    btnCancel.onclick = function() {
        overlay.style.display = 'none';
        // QA Logging: TC-04 Megszakítás forgatókönyv lefedettsége
        console.warn(`TC-04 Teszt: Mentés megszakítva. A memória tartalma megmaradt (${count} db módosítás).`);
    };
}

// Aszinkron Bulk-Write hálózati művelet (Mentés Supabase felé)
async function saveBulkChanges() {
    const btn = document.getElementById('btnBulkSave');
    const originalContent = btn.innerHTML;
    btn.disabled = true; // Lock UI network kérés alatt
    btn.innerHTML = '<i class="ph-bold ph-spinner ph-spin"></i><span>Mentés...</span>'; 
    
    try {
        // Csomagokat csinálunk abból az adatból amit "bevásárlókosárba" tettünk
        const updates = Object.entries(pendingChanges).map(([cikkszam, db]) => ({
            cikkszam, db
        }));
        
        // Elküldjük a csomagokat a backend API-nak (tömeges mentés)
        const response = await fetch(`${API_URL}/update-bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                updates,
                userId: currentUser.id,
                role: currentUser.role
            })
        });
        
        const result = await response.json();
        
        // API válasz validálása
        if (!response.ok || !result.success) {
            console.error("Módosítási API hiba:", result.error);
            throw new Error(result.error || "Hibás szerver válasz.");
        }
        
        // --- Sikeres Tranzakció ---
        console.log(`Sikeresen módosítva: ${result.count || updates.length} db termék.`);
        
        // UI státusz frissítése: Siker indikátor
        btn.innerHTML = '<i class="ph-bold ph-check"></i> <span>Mentve!</span>';
        btn.classList.add('save-success');

        // Input reset a tranzakció lezárása utána
        document.querySelectorAll('.manual-stock-input').forEach(input => {
            input.value = ''; 
        });

        // Memória ürítése és DOM state resetelés
        pendingChanges = {}; 
        updatePendingBadge();
        utolsoModositas = Date.now(); 
        
        // Timeout callback a UI reseteléséhez és teljes resync hez (2s delay)
        setTimeout(() => {
            btn.innerHTML = originalContent; 
            btn.classList.remove('save-success');
            updatePendingBadge();
            fetchProducts(); // Automatikus kliens frissítése az adatbázis igazolt állapotára
        }, 2000); 
        
    } catch (error) {
        console.error("Hiba tömeges mentéskor:", error);
        alert("Hiba történt a mentés során!"); 
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

// Ha a szinkron gombra rányom felül (csak animáljuk és utána rákényszerítjük a frissítést)
function simulateSync() {
    const btn = document.querySelector('.btn-sync');
    if (!btn) return;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="ph-bold ph-spinner ph-spin"></i><span>...</span>';
    btn.disabled = true;
    setTimeout(() => {
        btn.innerHTML = '<i class="ph-bold ph-check"></i><span>Kész!</span>';
        fetchProducts();
        setTimeout(() => { btn.innerHTML = originalHTML; btn.disabled = false; }, 2000);
    }, 1000);
}


// =========================================================================
// 8. KERESÉS EST SZŰRÉS (View Controllers)
// =========================================================================

// Élő kereső (Live Search) és indexelés
function filterStock() {
    const query = searchInput.value.toLowerCase(); // Case-insensitive query transzformáció
    
    // Auto-view váltás keresés esetén, ha a dashboardon lennénk
    if (query.length > 0 && aktualisSzuro === 'dashboard') {
        aktualisSzuro = 'all'; 
    }

    // Teljesszövegű szűrés implementálása memóriában (Név és SKU alapján)
    const szurt = termekek.filter(t => t.nev.toLowerCase().includes(query) || t.cikkszam.toLowerCase().includes(query));
    
    // Virtuális nézet frissítése
    renderVisualStock(szurt);
}

// Heurisztikus kategorizáló algoritmus
// Terméknevek szemantikai elemzése alapján csoportosít
function getTermekCategory(t) {
    const n = t.nev.toLowerCase(); 
    
    // Waterfall regex-szerű string pattern matching kizárásokkal (!includes)
    if ((n.includes('laptok') || n.includes('tábla') || n.includes('plexi') || n.includes('árcímketartó')) && !n.includes('felíró')) return 'plexitok';
    if (n.includes('ruhazsák') || n.includes('öltönyzsák') || n.includes('ruhafólia') || (n.includes('fólia') && n.includes('sztender'))) return 'ruhazsak';
    if (n.includes('sztender') || n.includes('állvány')) return 'sztender';
    if (n.includes('ársín') || n.includes('polccímke') || n.includes('kartoncímke')) return 'polccimke';
    if ((n.includes('pénztárgépszalag') || n.includes('hőpapír') || n.includes('bankterminál') || n.includes('repont') || n.includes('envipco') || n.includes('kasszaszalag')) && !n.includes('mérlegcímke')) return 'kasszaszalag';
    if ((n.includes('vonalkód') || n.includes('körcímke') || n.includes('tekercs') || n.includes('mérlegcímke') || n.includes('etikett') || n.includes('festékszalag') || n.includes('stanc')) && !n.includes('függő')) return 'vonalcimke';
    if (n.includes('belövő') || n.includes('szál') && !n.includes('árazószalag') && !n.includes('pénztárgépszalag') && !n.includes('kasszaszalag') && !n.includes('zárószalag') && !n.includes('csomagoló') || n.includes('körszál') || (n.includes('címke') && n.includes('függő')) || (n.includes('etikett') && n.includes('függő')) || n.includes('pisztoly')) return 'cimkezo';
    if (n.includes('árazó') || n.includes('festékhenger')) return 'arazogep';
    if (n.includes('táska') || n.includes('tasak') || n.includes('zacskó') || n.includes('szemeteszsák') || n.includes('szatyor')) return 'taska';
    if (n.includes('kosár')) return 'kosar';
    if (n.includes('vállfa') || n.includes('méretjelölő') || n.includes('méretjelző') || n.includes('csipesz') || n.includes('divider') || n.includes('leszedő')) return 'vallfa';
    
    // Összetett tömb vizsgálat másodlagos csoportosításhoz (Irodaszerek)
    const irodaSzavak = ['toll', 'marker', 'boríték', 'genotherm', 'gyorsfűző', 'spirálfüzet', 'radír', 'ragasztó', 'tűzőkapocs', 'nyomtatvány', 'kábelkötegelő', 'papír', 'cellux', 'victoria', 'a4', 'apli', 'csomagolószalag', 'felírótábla'];
    if (irodaSzavak.some(szo => n.includes(szo))) return 'irodaszer';
    
    // Default fallback kategória
    return 'egyeb';
}

// Kritikus készletnézet aktiválása (Threshold Filter)
function filterCritical() {
    aktualisSzuro = 'critical';
    document.querySelectorAll('.category-buttons button').forEach(b => b.classList.remove('active-btn')); 
    
    // Filter by KPI threshold (<20% limit)
    const szurt = termekek.filter(t => (t.max > 0 ? (t.db/t.max)*100 : 0) < 20 || t.db <= 0);
    renderVisualStock(szurt); 
}

// DOM elem és szűrő paraméter reset (Kategóriaválasztó)
function filterCategory(kod, clear = true) {
    aktualisSzuro = kod; 
    if (clear) {
        searchInput.value = "";
        
        document.querySelectorAll('.category-buttons button').forEach(b => b.classList.remove('active-btn'));
        
        // Esemény delegáció alapú gomb-aktviáció
        const e = window.event || event;
        if (e && e.target) {
            const btn = e.target.closest('button');
            if (btn) btn.classList.add('active-btn');
        }
    }
    
    if (kod === 'all') { 
        renderVisualStock(termekek); return; 
    }

    // Filter pipeline alapján célzott lista-frissítés
    const szurt = termekek.filter(t => getTermekCategory(t) === kod);
    renderVisualStock(szurt); 
}

// Kártya CSS 3D transzformáció vezérlő (Flip handler timeout referenciákkal)
function toggleCard(cardEl) {
    const cikkszam = cardEl.getAttribute('data-cikkszam');
    cardEl.classList.toggle('flipped');

    // Korábbi animációs timeout megszakítása versenyhelyzet miatt
    if (cardTimers[cikkszam]) {
        clearTimeout(cardTimers[cikkszam]);
        delete cardTimers[cikkszam];
    }

    // Auto-restore időzítő (5s), State clear a timeout callback-ben
    if (cardEl.classList.contains('flipped')) {
        cardTimers[cikkszam] = setTimeout(() => {
            cardEl.classList.remove('flipped');
            delete cardTimers[cikkszam];
        }, 5000);
    }
}


// =========================================================================
// 9. VIRTUAL DOM RENDERELŐ MOTOR (Main View Layer)
// =========================================================================

// Dinamikus HTML DOM fa rendering 
function renderVisualStock(adatok) {
    appDiv.classList.add('grid-container'); 
    
    // Elem nélküli állapot lekezelése
    if (adatok.length === 0) {
        appDiv.innerHTML = '<div style="color: var(--text-muted); text-align: center; grid-column: 1/-1; padding: 40px; font-size: 1.2rem;">Ebben a kategóriában nincsenek termékek.</div>';
        return;
    }

    // DOM Caching: Részleges frissítés (Partial Update Lifecycle) vizsgálata
    const letezo = appDiv.querySelectorAll('.card-container');
    
    // Ha a node length eltér, layout rebuild szükséges
    if (letezo.length !== adatok.length) { 
        fullRender(adatok); 
        return; 
    }

    // VDOM diff algoritmus elkerülése, gyors data-binding (csak a mutálódott adatokat rendereljük újra attribútum szinten)
    adatok.forEach((t, i) => {
        const c = letezo[i];
        const hasImage = c.querySelector('.product-image-container');
        // Ha valami véletlen folyán eltérne a cikkszám ami kijött...
        if (c.getAttribute('data-cikkszam') !== String(t.cikkszam) || !hasImage) { 
            fullRender(adatok); 
            return; 
        }
        
        // % Számolás
        let sz = t.max > 0 ? Math.round((t.db / t.max) * 100) : 0;
        if (sz > 100) sz = 100;
        
        // CSS Style-ok szín szerint (Green=Jó, Yellow=Közepes, Red=Kritikus)
        let sCl = 'stock-high'; let tCl = 'text-green';
        if (sz < 40) { sCl = 'stock-med'; tCl = 'text-yellow'; }
        if (sz < 20 || t.db <= 0) { sCl = 'stock-low'; tCl = 'text-red'; }
        
        const qS = c.querySelector('.current-qty');
        const fD = c.querySelector('.progress-fill');
        
        // Írjuk is ki az oldalra az újakat
        if (qS) { qS.innerText = t.db; qS.className = `current-qty ${tCl}`; }
        // Grafikai sáv hosszát pedig nyújtsuk % alapján (width CSS!)
        if (fD) { fD.style.width = `${sz}%`; fD.className = `progress-fill ${sCl}`; }
    });
}


// --- Képkezelő Varázslat ---
// Képek kezelése. Ha az első forrás nem működik vagy letiltottak a Vallfa HU-nál, a program automatikusan fut
// az Attempt-ek mentén és mindenféle alternatív "szendvics próbálgatáson" megy át hogy megtalálja a képet aszerint amit megadtunk.
function handleImageFallback(img) {
    if (!img.complete || img.naturalWidth <= 1) { // Lényegében "Nem létezik a fájl" vagy "túl kicsi hiba pixel" (Eltört kép)
        const sku = img.getAttribute('data-sku');
        const name = img.getAttribute('data-name');
        const attempt = parseInt(img.getAttribute('data-attempt') || '0'); // Melyik kísérletben futunk jelenleg?

        const patterns = [
            `https://ktmmhgmfzfqbwianrsbx.supabase.co/storage/v1/object/public/termek_kepek/${sku}.jpg`, // 1. Elsődleges: Supabase Bucket
            `https://ktmmhgmfzfqbwianrsbx.supabase.co/storage/v1/object/public/termek_kepek/${sku}.JPG`, // nagybetűs kiterjesztés esetleg
            `https://ktmmhgmfzfqbwianrsbx.supabase.co/storage/v1/object/public/termek_kepek/${sku}.png`,
            `https://vallfa.hu/img/41068/${sku}/560x560,r/${sku}.jpg`, // 2. Tartalék 1
            `https://vallfa.hu/img/41068/${sku}/500x500/${sku}.jpg`,
            `https://vallfa.hu/shop_ordered/41068/shop_altkep/${sku}.jpg`,
            `https://vallfa.hu/shop_ordered/41068/shop_altkep/${sku}_altkep_1.jpg`,
            `https://vallfa.hu/shop_ordered/41068/pic/${sku}.jpg`,
            // 3. Ha feladta mert nem találta: Létrehozunk egy "Placeholdert", vagyis egy csillogóan megrajzolt betűs kék keretet a termék nevével és Cikkszámával
            `https://via.placeholder.com/400/0f172a/00f3ff?text=${encodeURIComponent(name.split(' ')[0] + '\n#' + sku)}`
        ];

        if (attempt < patterns.length) {
            img.setAttribute('data-attempt', attempt + 1);
            img.src = patterns[attempt]; // Lecseréli a HTML-en lévő linket a következőre és maga az 'onerror' újra meg is hívja ezt a függvényt a háttérben.
        } else {
            // Megadta magát
            img.onload = null;
            img.onerror = null;
            img.style.opacity = '0.5';
        }
    }
}

// "A Mindent-tudó" képlink beállító. Szoftvermérnöki nevén hardcoding vagy lookup table. 
// Itt vannak azok a linkek amik kivételek, mivel az oldal struktúrája és kép neve mindig más a webáruház motorján belül. 
// A Cikkszámmal határozzuk meg!
function getProductImage(cikkszam, name, kep) {
    if (kep) return kep;
    
    // Explicit linkek 
    if (cikkszam === '601056') return 'https://vallfa.hu/img/41068/601045T/560x560,r/601045T.jpg'; 
    if (cikkszam === '601045TRUD') return 'https://vallfa.hu/img/41068/601045T/560x560,r/601045T.jpg';
    if (cikkszam === '601047TFEKEZ') return 'https://vallfa.hu/img/41068/601047TFEKEZ/560x560,r/601047TFEKEZ.jpg';
    if (cikkszam === '601047SONG160') return 'https://vallfa.hu/img/41068/601047SONG160/560x560,r/601047SONG160.jpg';
    if (cikkszam === '6010414FT') return 'https://vallfa.hu/img/41068/6010414FT/560x560,r/6010414FT.jpg';
    if (cikkszam === '6010395FT') return 'https://vallfa.hu/img/41068/6010395FT/560x560,r/6010395FT.jpg';
    if (cikkszam === '6010406FT') return 'https://vallfa.hu/img/41068/6010406FT/560x560,r/6010406FT.jpg';
    
    // Alternatív mappák elérése 
    if (cikkszam === '8852660') return 'https://vallfa.hu/shop_ordered/41068/shop_altkep/8852660.jpg';
    if (cikkszam === '25x16K') return 'https://vallfa.hu/shop_ordered/41068/shop_altkep/25x16k.jpg';
    if (cikkszam === '22x12K') return 'https://vallfa.hu/shop_ordered/41068/shop_altkep/22x12K.jpg';
    if (cikkszam === '122SZT') return 'https://vallfa.hu/shop_ordered/41068/shop_altkep/122szt.jpg';
    if (cikkszam === '150064') return 'https://vallfa.hu/img/41068/150064/560x560,r/150064.jpg'; 

    if (cikkszam === '503590' || cikkszam === '503594') return 'https://vallfa.hu/img/41068/503590/560x560,r/503590.jpg'; 
    
    if (cikkszam === '900132') return 'https://vallfa.hu/shop_ordered/41068/shop_altkep/900132.jpg';
    if (cikkszam === '900133') return 'https://vallfa.hu/shop_ordered/41068/shop_altkep/900133.jpg';
    if (cikkszam === '900152') return 'https://vallfa.hu/shop_ordered/41068/shop_altkep/900152.jpg';
    if (cikkszam === '601070') return 'https://vallfa.hu/shop_ordered/41068/shop_altkep/601070.jpg';
    if (cikkszam === '601070R') return 'https://vallfa.hu/shop_ordered/41068/shop_altkep/601070.jpg';
    
    // Legutolsó szűrő: Ha normális cikk szám az amit megírtak (regex -> sima szöveg vagy szám kötőjeles) generáljon ki magától egy elérési linket
    if (cikkszam && (cikkszam.match(/^[a-zA-Z0-9-]+$/))) {
        return `https://vallfa.hu/img/41068/${cikkszam}/560x560,r/${cikkszam}.jpg`;
    }
    
    // Placeholder leges-legvégül ha tényleg minden tönkremegy!
    return `https://via.placeholder.com/400/0f172a/00f3ff?text=${encodeURIComponent(name || 'VisualStock')}`;
}

// Ha a sima renderelő (renderVisualStock) megadta magát, vagy leg-első oldalbetöltés volt, csináljon egy TELJESEN NULLÁRÓL LÉVŐ ÚJRA RAJZOLÁST
function fullRender(adatok) {
    let html = '';
    
    // "Minden adathoz hozzáadjuk a következő szöveget!" Ez a Hatalmas HTML generátor
    adatok.forEach((t, i) => {
        // Ismételten:  Grafika készítése adatből
        let sz = t.max > 0 ? Math.round((t.db / t.max) * 100) : 0;
        if (sz > 100) sz = 100;
        let sCl = 'stock-high'; let tCl = 'text-green';
        if (sz < 40) { sCl = 'stock-med'; tCl = 'text-yellow'; }
        if (sz < 20 || t.db <= 0) { sCl = 'stock-low'; tCl = 'text-red'; }

        // A kép linkjét berántjuk a varázslóból függvényből (mivel mindegyik webes link)
        const productImage = getProductImage(t.cikkszam, t.nev, t.kep);

        // És Írd hozzára HTML VÁZBA ("`" jelekkel van készítve ami megengedi az áthajlást és a ${} beszúrásokat! Ez eszméletlen fontos technika)
        html += `
            <div class="card-container" data-cikkszam="${t.cikkszam}" onclick="toggleCard(this)" style="animation-delay: ${i * 0.02}s">
                <div class="card-inner">
                    <!-- A kártya eleje -->
                    <div class="card-front">
                        <div class="card-top"><h3 class="termek-nev">${t.nev}</h3></div>
                        <div class="stock-status">
                            <div class="stock-numbers">
                                <span class="current-qty ${tCl}">${t.db}</span>
                                <span class="max-qty">/ ${t.max} db</span>
                            </div>
                            <div class="progress-track"><div class="progress-fill ${sCl}" style="width: ${sz}%"></div></div>
                        </div>
                        
                        <!-- Csak Az "ADMIN" nevű szerepkörhöz íródik hozzá, különben le van szedve CSS el a lapról ha Te "USER" vagy-->
                        <div class="card-actions admin-only">
                            <button class="btn-action btn-minus" onclick="event.stopPropagation(); modifyStock('${t.cikkszam}', -1)"><i class="ph-bold ph-minus"></i></button>
                            <input type="number" class="manual-stock-input"
                                   onclick="event.stopPropagation()" 
                                   oninput="setManualStock('${t.cikkszam}', this.value)"
                                   onkeydown="if(event.key==='Enter') this.blur()"
                                   inputmode="numeric">
                            <button class="btn-action btn-plus" onclick="event.stopPropagation(); modifyStock('${t.cikkszam}', 1)"><i class="ph-bold ph-plus"></i></button>
                        </div>
                    </div>
                    
                    <!-- Kártya hátlapja a Képpel és infokkal-->
                    <div class="card-back">
                        <div class="back-content-left">
                            <div class="back-header"><i class="ph-bold ph-info" style="color: var(--neon-cyan);"></i><span>ADATOK</span></div>
                            <div class="back-details">
                                <div class="detail-item" style="flex-direction: column; align-items: flex-start; gap: 0.3rem;">
                                    <span class="label">TERMÉK</span>
                                    <span class="value" style="text-align: left; line-height: 1.3;">${t.nev}</span>
                                </div>
                                <div class="detail-item"><span class="label">CIKK</span><span class="value">#${t.cikkszam}</span></div>
                                <div class="detail-item"><span class="label">MAX</span><span class="value">${t.max} db</span></div>
                                <div class="detail-item"><span class="label">KATEGÓRIA</span><span class="value">${aktualisSzuro === 'all' ? 'Összes' : document.querySelector('.category-buttons button.active-btn')?.innerText.trim() || 'Egyéb'}</span></div>
                            </div>
                        </div>
                        <!-- Jobb oldal: Termék kép (Glow hatással) -->
                        <div class="back-content-right">
                            <div class="image-glow-overlay"></div>
                            <div class="product-image-container">
                                <img src="${productImage}" 
                                     class="product-image" 
                                     loading="lazy" 
                                     data-sku="${t.cikkszam}"
                                     data-name="${t.nev}"
                                     data-attempt="0"
                                     onload="handleImageFallback(this)"
                                     onerror="handleImageFallback(this)"
                                     alt="${t.nev}">
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    });
    
    // A megformázott hatalmas HTML sort bedobjuk az igazi oldal main elembe:
    appDiv.innerHTML = html;
}

// =========================================================================
// 10. NAPLÓ (ELŐZMÉNYEK) MEGJELENÍTÉSE - CSAK ADMIN
// =========================================================================
async function renderHistory(isBackgroundRefresh = false) {
    // Jogosultság ellenőrzése: A naplót csak Adminisztrátori szerepkörrel lehet megtekinteni
    if (!currentUser || currentUser.role !== 'admin') return;
    
    aktualisSzuro = 'history';
    document.querySelectorAll('.category-buttons button').forEach(b => b.classList.remove('active-btn'));
    
    // Ha nem háttérfrissítés, vagy ha valamiért még nincs is táblázat kirajzolva
    const existingBody = document.getElementById('historyTableBody');
    if (!isBackgroundRefresh || !existingBody) {
        appDiv.classList.remove('grid-container');
        appDiv.innerHTML = `
            <div class="dashboard-container">
                <div class="dashboard-welcome" style="margin-bottom: 2rem;">
                    <h2><i class="ph-bold ph-clock-counter-clockwise"></i> Módosítási Napló</h2>
                    <button class="btn-action" onclick="renderDashboard()" style="padding: 0.5rem 1rem; border-radius: 8px; font-weight: bold; cursor: pointer; border: none; background: rgba(255,255,255,0.1); color: white;"><i class="ph-bold ph-arrow-left"></i> Vissza</button>
                </div>
                <div class="history-table-container">
                    <table class="history-table">
                        <thead>
                            <tr>
                                <th>Dátum</th>
                                <th>Felhasználó</th>
                                <th>Cikkszám</th>
                                <th>Terméknév</th>
                                <th style="text-align:center">Változás</th>
                            </tr>
                        </thead>
                        <tbody id="historyTableBody">
                            <tr><td colspan="5" style="text-align:center; padding: 2rem;"><i class="ph-bold ph-spinner ph-spin"></i> Betöltés...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    try {
        const response = await fetch(`${API_URL}/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: currentUser.role })
        });
        
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error || "Hiba az előzmények lekérésekor.");
        
        const tbody = appDiv.querySelector('#historyTableBody');
        
        if (!result.logs || result.logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--text-muted);">Nincs még módosítási előzmény.</td></tr>';
            return;
        }
        
        let rowsHtml = '';
        result.logs.forEach(log => {
            const date = new Date(log.created_at).toLocaleString('hu-HU');
            const diff = log.new_qty - log.old_qty;
            const sign = diff > 0 ? '+' : '';
            const colorClass = diff > 0 ? 'text-green' : (diff < 0 ? 'text-red' : 'text-yellow');
            
            // Megkeressük a termék nevét a meglévő "termekek" listából (ami a frontenden van)
            const t = termekek.find(t => String(t.cikkszam) === String(log.cikkszam));
            const termekNev = t ? t.nev : 'Ismeretlen termék';
            
            const logUsername = log.felhasznalok ? log.felhasznalok.username : 'Ismeretlen';
            
            rowsHtml += `
                <tr>
                    <td>${date}</td>
                    <td style="color: var(--neon-cyan);">${logUsername}</td>
                    <td>#${log.cikkszam}</td>
                    <td>${termekNev}</td>
                    <td style="text-align:center" class="qty-change ${colorClass}">${log.old_qty} &rarr; ${log.new_qty} (${sign}${diff})</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = rowsHtml;
        
    } catch (e) {
        console.error("Napló hiba:", e);
        appDiv.querySelector('#historyTableBody').innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--accent-red);">Hiba a napló betöltésekor: ' + e.message + '</td></tr>';
    }
}

// =========================================================================
// 11. ALKALMAZÁS INICIALIZÁLÁS (Bootstrap / Entry Point)
// =========================================================================
try {
    checkSession(); // Cache authentikáció indítása
    setInterval(updateClock, 1000); // UI tick clock indítása (1000ms loop)
    updateClock(); 
    setInterval(() => fetchProducts(), 10000); // Polling daemon a szerver szinkronizációhoz (10s)

    // --- Aktivitás figyelő események regisztrálása ---
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
        window.addEventListener(evt, () => {
            lastActivity = Date.now();
        }, { passive: true });
    });

    // PWA: Offline állapot kezelése és Service Worker inicializálás helye
} catch (e) {
    console.error("Boot hiba - Az alkalmazás inicializálása megszakadt:", e); 
}
