// =========================================================================
// 1. BACKEND API KAPCSOLAT
// =========================================================================
// Ezt a szerveroldali API-t hívjuk meg (Edge Function) a Supabase közvetlen elérése helyett
const API_URL = "https://ktmmhgmfzfqbwianrsbx.supabase.co/functions/v1/api";

// =========================================================================
// 2. GLOBÁLIS VÁLTOZÓK - Az alkalmazás "memóriája"
// =========================================================================
// Ezeket a változókat az egész fájlban használjuk, ide mentünk mindent, 
// amit a program futása közben észben kell tartani.
const appDiv = document.getElementById('app'); // A HTML fájlunk <div id="app"> eleme, ide fogjuk bepakolni a termékkártyákat
const searchInput = document.getElementById('searchInput'); // A keresőmező HTML eleme
let termekek = []; // Egy üres lista (tömb), ebbe töltjük le majd a termékeket az adatbázisból
let aktualisSzuro = 'all'; // Eltároljuk, hogy épp melyik kategória gombra kattintott a felhasználó
let utolsoModositas = 0; // Egy szám (időbélyeg), ami megmondja mikor módosítottunk utoljára
let cardTimers = {}; // Ha megfordítasz egy kártyát, itt számoljuk vissza az 5 másodpercet a visszafordításig
let lastSyncTime = null; // Ide mentjük el, hogy mikor frissítettük utoljára az adatokat


// =========================================================================
// 3. BEJELENTKEZÉS ÉS JOGOSULTSÁGOK
// =========================================================================
let currentUser = null; // Ide mentjük el, hogy éppen ki van bejelentkezve (pl. a neve és hogy 'admin' vagy 'user')
let pendingChanges = {}; // Ide gyűjtjük azokat a beírt raktárkészlet módosításokat, amiket még nem mentettünk el a felhőbe

// --- Jelszó küldése a Backend-nek (Titkosítás ott történik) ---
// A jelszót most már nem a frontend kódolja, hanem az új biztonságos Backend szerver.

// --- Bejelentkezési folyamat gépezete ---
async function handleLogin() {
    // 1. Kiolvassuk miket írt be a felhasználó a mezőkbe
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('loginPassword').value.trim();
    const errorEl = document.getElementById('loginError');
    
    // 2. Ellenőrizzük, hogy egyáltalán beírt-e valamit
    if (!user || !pass) {
        errorEl.innerText = "Kérlek tölts ki minden mezőt!";
        return; // Ha üres, itt megállítjuk a folyamatot
    }

    try {
        // 3. API hívás a Backendünk felé (Bejelentkezés)
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        
        const result = await response.json();

        // 4. Ha hiba van, vagy nincs ilyen ember...
        if (!response.ok) {
            errorEl.innerText = result.error || "Hibás adatok vagy jelszó!"; // Ezt schliemann (biztonsági) okokból nem részletezzük, hogy melyik volt a rossz
        } else {
            // 5. Ha minden jó, hívjuk meg a loginSuccess-t (Beengedjük a rendszerbe)
            loginSuccess({ name: result.user.username, role: result.user.role });
        }
    } catch (e) {
        console.error("Login hiba:", e);
        errorEl.innerText = "Hiba történt a bejelentkezés során!";
    }
}

// --- Új felhasználó regisztrációja (Fiók létrehozása) ---
async function handleRegister() {
    // Kiolvassuk az input mezőket
    const user = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPassword').value.trim();
    const errorEl = document.getElementById('regError');
    
    // Alapvető hibakeresés (minden ki van-e töltve, van-e @ az emailben)
    if (!user || !email || !pass) {
        errorEl.innerText = "Kérlek tölts ki minden mezőt!"; return;
    }
    if (!email.includes('@')) {
        errorEl.innerText = "Érvénytelen e-mail cím!"; return;
    }
    if (user.toLowerCase() === 'admin') {
        errorEl.innerText = "Az 'admin' név foglalt!"; return;
    }

    try {
        // Bepakoljuk (insert) az új sort az adatbázisba a Backend API-n keresztül
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, email: email, password: pass })
        });
        
        const result = await response.json();

        if (!response.ok) {
            console.error("Regisztrációs API hiba:", result);
            // Kód '23505' azt jelenti a SQL-ben, hogy "Ez az adat már létezik" 
            if (result.code === '23505') errorEl.innerText = "A név vagy e-mail már létezik!";
            else errorEl.innerText = "Szerver hiba: " + (result.error || "Ismeretlen hiba");
        } else {
            // Sikerült!
            alert("Sikeres regisztráció! Most már bejelentkezhetsz.");
            toggleLoginView('login'); // Visszavisszük a belépés nézetre
        }
    } catch (e) {
        console.error("Regisztrációs kliens hiba:", e);
        errorEl.innerText = "Hiba történt: " + e.message;
    }
}

// =========================================================================
// 4. FELHASZNÁLÓI FELÜLET (UI) SEGÉDFÜGGVÉNYEK ÉS LÁTVÁNYTERV
// =========================================================================

// Jelszó elrejtése vagy mutatása (szemecske ikon lenyomása)
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.parentElement.querySelector('.password-toggle');
    // Ha eddig pöttyöket mutatott (password), akkor állítsuk szövegre (text) és fordítva
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('ph-eye', 'ph-eye-slash'); // Cseréljük ki az ikont
    } else {
        input.type = 'password';
        icon.classList.replace('ph-eye-slash', 'ph-eye');
    }
}

// Váltakozás a Belépés és a Regisztráció formok között (eltüntetjük az egyiket, mutatjuk a másikat)
function toggleLoginView(view) {
    const loginForm = document.getElementById('loginFormView');
    const regForm = document.getElementById('regFormView');
    const loginError = document.getElementById('loginError');
    const regError = document.getElementById('regError');

    if (view === 'reg') {
        loginForm.style.display = 'none'; // Rejtsd el a belépést
        regForm.style.display = 'block';  // Mutasd a regisztrációt
        regError.innerText = "";
        
        // Biztonsági okokból kiürítjük a regisztrációs mezőket minden megnyitáskor
        const fields = ['regUsername', 'regEmail', 'regPassword'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });
        
        // Jelszó mező visszaállítása rejtettre, ha véletlen látható maradt
        const passEl = document.getElementById('regPassword');
        if (passEl) {
            passEl.type = 'password';
            const icon = passEl.parentElement.querySelector('.password-toggle');
            if (icon) icon.classList.replace('ph-eye-slash', 'ph-eye');
        }
    } else {
        loginForm.style.display = 'block'; // Mutasd a belépést
        regForm.style.display = 'none';    // Rejtsd el a regisztrációt
        loginError.innerText = "";
    }
}

// Ezt a függvényt hívjuk meg, ha a szerver visszaigazolta a jó jelszót
function loginSuccess(session) {
    console.log("Sikeres belépés:", session.name);
    
    // Globális változóba mentjük az adatait
    currentUser = session;
    
    // Elmentjük a böngésző memóriájába (localStorage) is, hogy oldalfrissítés után se kelljen újra belépni
    localStorage.setItem('vs_session', JSON.stringify(session));
    
    // Eltüntetjük a fekete bejelentkező képernyőt (loginOverlay-t)
    document.getElementById('loginOverlay').style.display = 'none';
    
    // Kiírjuk a fejlécbe a bal felső sarokba a nevét
    document.getElementById('userNameDisplay').innerText = session.name;
    appDiv.innerHTML = ""; // Kitöröljük a régi adatokat az app területéről
    
    // HA ADMIN A FELHASZNÁLÓ:
    if (session.role === 'admin') {
        // Rátesszük az egész oldalra (body) az "is-admin" címkét (css classt).
        // A CSS-ben meg van írva, hogy ha az oldal body-ja "is-admin", akkor mutassa meg
        // a +/- gombokat, meg a szinkronizáló mentés gombokat. Ez a Vizuális rész!
        document.body.classList.add('is-admin');
    } else {
        document.body.classList.remove('is-admin');
    }
    
    // Végül: Betöltjük a termékeket a szerverről
    fetchProducts(true); 
}

// Kijelentkezés megnyomása
function handleLogout() {
    currentUser = null; // Kitöröljük ki van belépve
    localStorage.removeItem('vs_session'); // Kitöröljük a böngésző memóriájából is
    document.body.classList.remove('is-admin'); // Elvesszük a gombokat az oldaldról
    document.getElementById('loginOverlay').style.display = 'flex'; // Visszahozzuk a bejelentkező képernyőt
    document.getElementById('userNameDisplay').innerText = "Belépés";
    
    // Letörlünk minden korábban beírt adatot a mezőkből
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
    
    // Kitöröljük a hibaüzeneteket és az app tartalmát
    document.getElementById('loginError').innerText = "";
    document.getElementById('regError').innerText = "";
    appDiv.innerHTML = ""; 
    pendingChanges = {}; // Megsemmisítjük a be nem küldött mentéseket
    updatePendingBadge();
}

// Oldal újratöltésekor (frissítéskor) megkérdezi, hogy vagyunk-e már belépve
function checkSession() {
    console.log("Munkamenet ellenőrzése...");
    try {
        const saved = localStorage.getItem('vs_session'); // Megnézzük a memóriát
        if (saved) {
            console.log("Mentett munkamenet megtalálva:", JSON.parse(saved).name);
            loginSuccess(JSON.parse(saved)); // Ha van arc, beléptetjük
        } else {
            console.log("Nincs mentett munkamenet, belépő megjelenítése.");
            const overlay = document.getElementById('loginOverlay');
            if (overlay) overlay.style.display = 'flex'; // Ha nincs, kérjük a belépést
        }
    } catch (e) {
        // Biztonsági rés: Ha valami elszáll hibával, rakjuk fel a belépő ablakot
        const overlay = document.getElementById('loginOverlay');
        if (overlay) overlay.style.display = 'flex';
    }
}

// Az óra megjelenítése fönn a fejlécben
function updateClock() {
    const now = new Date(); // Itt lekérjük a jelenlegi pontos időt a gépről
    const clockEl = document.getElementById('clock');
    if (clockEl) {
        // Kiírjuk magyar(hu-HU) formátumban óra és perc
        clockEl.innerText = now.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
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
    
    // Megszámoljuk hány termék van amiből nagyon kevés van (20% alatti vagy 0 db a raktárban)
    const lowStockItems = termekek.filter(t => {
        let sz = t.max > 0 ? (t.db / t.max) * 100 : 0; // Kiszámoljuk a százalékot (Jelenlegi / Maximum * 100)
        return sz < 20 || t.db <= 0;
    });

    // Statisztika számok kiszámítása
    const totalItems = termekek.length; // Minden termék száma
    const criticalCount = lowStockItems.length; // Kritikusak száma
    // Itt megszámoljuk csak azt ami a "kasszaszalag" kategóriába esik
    const kasszaCount = termekek.filter(t => getTermekCategory(t) === 'kasszaszalag').length;

    // "Villogásmentes frissítés": Ha már eleve az Irányítópulton vagyunk, minek törölnénk le mindent?
    // Csak átírjuk a dobozokban a számokat. Ettől gyorsabb és szebb lesz a program!
    const existingDash = document.querySelector('.dashboard-container');
    if (existingDash) {
        const welcomeH2 = existingDash.querySelector('.dashboard-welcome h2');
        if (welcomeH2) welcomeH2.innerText = `Üdvözlünk, ${currentUser.name}!`;

        const valTotal = document.getElementById('stat-total-val');
        const valCrit = document.getElementById('stat-crit-val');
        const valKassza = document.getElementById('stat-kassza-val');
        const valSync = document.getElementById('last-sync-time');
        if (valTotal) valTotal.innerText = totalItems;
        if (valCrit) valCrit.innerText = criticalCount;
        if (valKassza) valKassza.innerText = kasszaCount;
        if (valSync) valSync.innerText = lastSyncTime || '--:--:--';
        return; // Itt kijövünk a függvényből, nem fűzi hozzá alul a HTML kódot
    }

    // Ha még nem az irányítópulton voltunk (pl kártyákat néztünk), akkor szépen felépítjük HTML-ben az egészet:
    document.querySelectorAll('.category-buttons button').forEach(b => b.classList.remove('active-btn')); // Letöröljük a kiemelést a gombokról

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
                    ${currentUser.role === 'admin' ? '<button onclick="simulateSync()"><i class="ph-bold ph-arrows-clockwise"></i> Adatok frissítése</button>' : ''}
                </div>
            </div>
        </div>
    `;
    appDiv.innerHTML = html; // Beleírjuk a generált kódot az #app nevű fő dobozba
}


// =========================================================================
// 6. ADATBÁZIS (TERMÉKEK) LEKÉRÉSE ÉS CSERÉLÉSE
// =========================================================================

// Ez a fő függvény, ez fut le minden 10 másodpercben, hogy letöltse az aktuális állapotot!
async function fetchProducts(showDashboard = false) {

    // VÉDELEM: Ha nincs senki bejelentkezve, ne csináljon semmit a háttérben!
    if (!currentUser) return;

    // Ha épp most kattintott a kolléga a mentésre (kevesebb mint 2 másodperce), 
    // akkor ne olvassunk be az adatbázisból takarítás közben (hogy nehogy beleszóljunk a mentésébe).
    if (Date.now() - utolsoModositas < 2000) return;
    
    try {
        // Lépés a Backend API felé: Kérem az összes adatot!
        const response = await fetch(`${API_URL}/products`);
        if (!response.ok) throw new Error('Nem sikerült letölteni a termékeket az API-tól.');
        
        const result = await response.json();
        const data = result.products;

        // Az adatokat "Megformogatjuk" vagyis "kipofozzuk" olyan struktúrába amit a kódunk kérni fog:
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
    } else {
        filterCategory(aktualisSzuro, false);
    }
}


// =========================================================================
// 7. RAKTÁR KÉSZLET MÓDOSÍTÁSA (PLUSZ ÉS MÍNUSZ GOMBOK)
// =========================================================================

// Amikor megnyomják a kártyán levő '+' vagy '-' gombot, ez hívódik meg
async function modifyStock(cikkszam, valtozas) {
    // 1. Biztonsági Ellenőrzés FONTOS! Csak Admin matathat a készletekben
    if (!currentUser || currentUser.role !== 'admin') return; 
    
    // VÉDELEM: Szólunk a frissítő motornak, hogy épp most nyúltunk a gombokhoz, álljon le!
    utolsoModositas = Date.now();
    
    // 2. Megkeressük melyik terméket akarja épp átállítani
    const termekIndex = termekek.findIndex(t => String(t.cikkszam) === String(cikkszam));
    if (termekIndex === -1) {
        console.error("Nem talalhato termek index! Cikkszam:", cikkszam);
        return; // Ha nem találja, hagyjuk rá
    }

    // 3. Kiszámoljuk a Matekot. 
    // Magyarázat: játéknál is használjuk a Math.max-ot. Veszünk két értéket: a "nulla" és  a "jelenlegi db + gombnyomás (valtozas lesz +1 vagy -1)".
    // A Math.max a kettő közül a NAGYOBBAT adja. Értsd: ha -3 lenne az eredmény, nulla lesz! Így sosem megy mínuszba a raktár.
    const ujKeszlet = Math.max(0, termekek[termekIndex].db + valtozas);

    // EXTRA VIZSGA LOG: Ha mínuszba akarna menni, írjon be a konzolba egy sárga figyelmeztetést!
    if (termekek[termekIndex].db + valtozas < 0) {
        console.warn(`TC-03 Teszt: Figyelem! A készlet nem mehet nulla alá! Művelet blokkolva.`);
    }

    termekek[termekIndex].db = ujKeszlet; // Mentjük az átírt értéket az ideglenes listába
    
    // 4. "Betesszük a bevásárlókosárba" a mentési feladatot, ezt utána gombnyomásra egyszerre küldjük a szerverre (optimalizáció)
    pendingChanges[cikkszam] = ujKeszlet;
    updatePendingBadge(); // Ez frissíti a kis számot a Módosítás Mentése gomb mellett felül

    // 5. Azonnali CÉLZOTT grafikus frissítés a kijelzőn (Ne rendereljük újra az egészet, mert az "ugrálást" okozhat kritikus nézetben)
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

// Ez számolja meg hány mentetlen dolog van és ezt írja rá a fenti kék gombra
function updatePendingBadge() {
    const count = Object.keys(pendingChanges).length; // Megszámolja hány sor (termék) módosult az egerészéstől
    const btn = document.getElementById('btnBulkSave');
    const badge = document.getElementById('pendingCount');
    if (btn && badge) {
        badge.innerText = count;
        // Ha nem piszkált senki bele a gombokba, akkor le van tiltva a mentés gomb
        btn.disabled = count === 0; 
    }
}

// Megerősítő ablak: "Biztos el akarod menteni?!" (Kattintás a fenti Módosítás Mentése gombra)
function confirmBulkUpdate() {
    const count = Object.keys(pendingChanges).length;
    if (count === 0) return; // Nincs is mit menteni!
    
    // Testreszabott (Cyberpunk) felugró ablak megjelenítése a natív window.confirm helyett
    const overlay = document.getElementById('confirmOverlay');
    const message = document.getElementById('confirmMessage');
    const btnOk = document.getElementById('btnConfirmOk');
    const btnCancel = document.getElementById('btnConfirmCancel');
    
    // Üzenet testreszabása
    message.innerHTML = `Biztosan módosítani kívánja a(z) <span style="color: var(--accent-orange); font-size: 1.3rem; font-weight: bold;">${count}</span> termék adatait?`;
    
    // Megjelenítés
    overlay.style.display = 'flex';
    
    // Megerősítés (Igen) gomb eseménye
    btnOk.onclick = function() {
        overlay.style.display = 'none';
        saveBulkChanges(); // Jöhet a feltöltés a felhőbe!
    };
    
    // Mégse gomb eseménye
    btnCancel.onclick = function() {
        overlay.style.display = 'none';
        console.warn(`TC-04 Teszt: Mentés megszakítva. A memória tartalma megmaradt (${count} db módosítás).`);
    };
}

// A módosított készletadatok (amit a pendigChanges-ben gyűjtögettünk) tényleges elküldése az Internetre
async function saveBulkChanges() {
    const btn = document.getElementById('btnBulkSave');
    const originalContent = btn.innerHTML;
    btn.disabled = true; // Lekapcsoljuk a gombot, amíg forog a karikája, ne lehessen spammelni (nyomkodni mint egy őrült)
    btn.innerHTML = '<i class="ph-bold ph-spinner ph-spin"></i><span>Mentés...</span>'; // Lecseréljük az ikonját a forgó izére
    
    try {
        // Csomagokat csinálunk abból az adatból amit "bevásárlókosárba" tettünk
        const updates = Object.entries(pendingChanges).map(([cikkszam, db]) => ({
            cikkszam, db
        }));
        
        // Elküldjük a csomagokat a backend API-nak (tömeges mentés)
        const response = await fetch(`${API_URL}/update-bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
            console.error("Módosítási API hiba:", result.error);
            throw new Error(result.error || "Hibás szerver válasz.");
        }
        
        // Ha idáig elért a program hiba nélkül, akkor SIKERES VOLT A MENTÉS!
        console.log(`Sikeresen módosítva: ${result.count || updates.length} db termék.`);
        pendingChanges = {}; // Kiürítjük a mentendők kosarát
        updatePendingBadge(); // Levesszük a jelvényt
        utolsoModositas = Date.now(); // Megjegyezzük, hogy mikor nyúltunk hozzá utoljára
        
        // Visszajelzés az Adminnak is a gomb feliratával:
        btn.innerHTML = '<i class="ph-bold ph-check"></i><span>Mentve!</span>';
        setTimeout(() => {
            btn.innerHTML = originalContent; // Visszaáll az eredeti formájára
            updatePendingBadge();
            fetchProducts(); // Töltsük le rögtön a vadiúj, internetes megerősített adatot!
        }, 2000); // 2 másodpercet várunk és utána hajtja végre (hogy látszódhasson a pipa)
        
    } catch (error) {
        console.error("Hiba tömeges mentéskor:", error);
        alert("Hiba történt a mentés során!"); // Szólunk a usernek hogy gond van, nem mentődtek a dolgai
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
// 8. KERESÉS, SZŰRÉS ÉS KATEGÓRIÁZÁS (VIZUÁLIS KELLEMENTEK)
// =========================================================================

// Amikor beírsz valamit a jobb fenti keresőmezőbe...
function filterStock() {
    const query = searchInput.value.toLowerCase(); // Minden betűt kisbetűsítünk (hogy Sztender vagy sZtENDER is egyezzen)
    
    // Ha kiléptett a felhasználó az irányítópultról amint beírt valamit
    if (query.length > 0 && aktualisSzuro === 'dashboard') {
        aktualisSzuro = 'all'; // Átkapcsolunk kártya módba!
    }

    // Fogjuk a teljes listát és FILTER! Csak azt hagyjuk meg a szurt (szűrt) dobozban, aminek a neve vagy cikkszáma tartalmazza amit beírtunk. (includes = tartalmazza)
    const szurt = termekek.filter(t => t.nev.toLowerCase().includes(query) || t.cikkszam.toLowerCase().includes(query));
    
    // Meg is hívjuk a kirajzolót az új listával
    renderVisualStock(szurt);
}

// "Okos mesterséges laikus gépezet", amely kitalálja egy termék neve alapján, melyik kategória fül höz tartozzon, mert az adatbázis ezt nem tartalmazza
function getTermekCategory(t) {
    const n = t.nev.toLowerCase(); // Minden kisbetűs ami egyszerűbbé teszi az ellenőrzést
    
    // Waterfall (vízesés mód) - Ahogy egyezést talál a kulcsszóval, rögtön hazaküldi a nevet. Vagyis ami "laptok", az Plexiképként kerül besorolásra... 
    // Ha több minden is van a nevében, mindig az első érvényesül. A '!' tagadást jelent, ha mondjuk Pénztárgépszalag de benne van a nevében, hogy "nem alkalmas kasszaszalag!" -> itt kizárásokat alkalmazhatunk.
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
    
    // Külön al-csoport (két lépéshátránnyal mert több kulcsszó kell hozzá), csak Irodaszerek:
    const irodaSzavak = ['toll', 'marker', 'boríték', 'genotherm', 'gyorsfűző', 'spirálfüzet', 'radír', 'ragasztó', 'tűzőkapocs', 'nyomtatvány', 'kábelkötegelő', 'papír', 'cellux', 'victoria', 'a4', 'apli', 'csomagolószalag', 'felírótábla'];
    // some: azt jelenti hogy "Van-e akármelyik a Szavak közül a nevében"?
    if (irodaSzavak.some(szo => n.includes(szo))) return 'irodaszer';
    
    // Ha végképp lemaradt mindenségből
    return 'egyeb';
}

// Ha a dashboardon rákattintott egy kolléga, hogy "Kritikus számú cuccok, meg is nyitja".
function filterCritical() {
    aktualisSzuro = 'critical';
    document.querySelectorAll('.category-buttons button').forEach(b => b.classList.remove('active-btn')); // Eltünteti a gombokról az aktiv rést.
    
    // Válassza le csak azokat a termékeket amiknek az állása a grafikonjukon 20%-nál kisebb
    const szurt = termekek.filter(t => (t.max > 0 ? (t.db/t.max)*100 : 0) < 20 || t.db <= 0);
    renderVisualStock(szurt); // Jeleníti meg őket
}

// Mikor rákattintanak a bal oldali Kategória fülek valamelyikére (Hosszú gombok).
// A 'kod' az a "besorolási csoport neve" amit átad a HTML! (Például 'sztender')
function filterCategory(kod, clear = true) {
    aktualisSzuro = kod; // Elmentjük hol vagyunk
    if (clear) {
        // Kitöröljük ami addig a keresőben be volt gépelve, hogy ne okozzon megakadást
        searchInput.value = "";
        
        // Levesszük azt az "aktív/más színű gomb" mintázatot az összes gombról
        document.querySelectorAll('.category-buttons button').forEach(b => b.classList.remove('active-btn'));
        
        // Célvisszajelzés: Rárakjuk csak arra a Gombra, amire egyáltalán kattintottak
        const e = window.event || event;
        if (e && e.target) {
            const btn = e.target.closest('button');
            if (btn) btn.classList.add('active-btn');
        }
    }
    
    if (kod === 'all') { 
        renderVisualStock(termekek); return; // Ha az "Összes" gombra kattintunk, simán odatesszük az egész táblát mindenestül
    }

    // Lekérjük szűréssel, amiknek az okos-besoroló szerinti neve megegyezik a gomb kategóriájával
    const szurt = termekek.filter(t => getTermekCategory(t) === kod);
    renderVisualStock(szurt); // Sokat rajzoltatunk...
}

// Termékkártya megfordítása (amikor rákattintasz egy téglalapra az oldalon)
function toggleCard(cardEl) {
    // "cardEl" - maga a Html keret (div). A data-cikkszam attribute-ból kivesszük a cikkszámot.
    const cikkszam = cardEl.getAttribute('data-cikkszam');
    // A html elemnek kiosztunk egy osztályt (flipped - fordított). Ezt a class-t a CSS veszi át
    // és abban van a 3D transzformáció ami fizikailag is csinálja az elfordulást!
    cardEl.classList.toggle('flipped');

    // Ha ez a kártya egyszer már ki lett pörgetve és a naptárban beterveztük h visszatalál majd pördülni (cardTimers változóval mérve)...
    if (cardTimers[cikkszam]) {
        // Töröljük ki az órát ha nagyon gyorsan rányomtál megint h csukja be! Ne fussunk össze a szerverrel.
        clearTimeout(cardTimers[cikkszam]);
        delete cardTimers[cikkszam];
    }

    // Beállítunk az órába, hogy 5000 millisec (= 5s) után szedje ki a "flipped" kulcsszót CSS-ből. Ami "felfordítja a kártyát alaphelyzetre". Automata viselkedés!
    if (cardEl.classList.contains('flipped')) {
        cardTimers[cikkszam] = setTimeout(() => {
            cardEl.classList.remove('flipped');
            delete cardTimers[cikkszam];
        }, 5000);
    }
}


// =========================================================================
// 9. AZ ALKALMAZÁS MOTORJA ÉS MEGJELENÍTÉSE (KÁRTYÁK KIRAJZOLÁSA HTML KÓDBA)
// =========================================================================

// "render = Lereszel és kirak" - HTML kóddal operáló renderelő függvény
function renderVisualStock(adatok) {
    appDiv.classList.add('grid-container'); // Művelet: Adjuk hozzá a hálózatszerű elhelyezést a mainhez.
    
    // Ha az adatlista tok üres (Mondjuk olyan szót kerestünk ami nem is létezik):
    if (adatok.length === 0) {
        appDiv.innerHTML = '<div style="color: var(--text-muted); text-align: center; grid-column: 1/-1; padding: 40px; font-size: 1.2rem;">Ebben a kategóriában nincsenek termékek.</div>';
        return;
    }

    // Itt eljátszunk az "Optimalizáció" gondolattal! Miért töltsük újra az EGÉSZ DOM elemeket a lapon ha:
    // a darabszám (termék) egyezik ami ki volt rajzolva és ami eddig itt állt?
    const letezo = appDiv.querySelectorAll('.card-container');
    
    // Ha az elemek nem passzolnak egymással (Példa, van új termék az adatban vagy a szűrt kevesebb), TELJES ÚJRARAJZTOLÁST KÉR (fullRender)
    if (letezo.length !== adatok.length) { 
        fullRender(adatok); 
        return; 
    }

    // Ha ugyanolyan termékek állnak ugyanitt (mondjuk csak a raktár adatok lettek frissítve az netről)
    // akkor spóroljunk az idővel és csak cseréjük le bennük az adatokat egy forrásból (forEach)! ÉLŐ RENDZSER ÉPÍTÉS!
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
            `https://ktmmhgmfzfqbwianrsbx.supabase.co/storage/v1/object/public/termek-kepek/${sku}.jpg`, // 1. Elsődleges: Supabase Bucket
            `https://ktmmhgmfzfqbwianrsbx.supabase.co/storage/v1/object/public/termek-kepek/${sku}.JPG`, // nagybetűs kiterjesztés esetleg
            `https://ktmmhgmfzfqbwianrsbx.supabase.co/storage/v1/object/public/termek-kepek/${sku}.png`,
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
// 10. AZ ALKALMAZÁS INDÍTÁSA - (Amikor megnyílik a weboldal)
// =========================================================================
try {
    checkSession(); // Keresi a user adatot a cookie okban, felébreszti a fiókodat.
    setInterval(updateClock, 1000); // Ráállítja a script motort az óramutatóhoz, Másodperces futással mutatja hány óra (1000 millisecond)
    updateClock(); // Manuális hivatkozás elsődlegesen, h ne kelljen várni az 1 másodpercet rögtön
    setInterval(() => fetchProducts(), 10000); // Na meg ez! Beállítja egy 10 másodperces órajáratra (hurokra) hogy folyton kérjen le adatbázis frissítést az adatokra
} catch (e) {
    console.error("Iniciáló hiba:", e); // Hatalmas hiba dobás fejlesztői leírással
}
