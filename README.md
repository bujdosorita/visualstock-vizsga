# 📦 VISUALSTOCK Premium
### Modern Üzletberendezés Raktárkezelő Rendszer

![Banner](VS_banner.png)

A **VisualStock** egy modern, **Neon/Cyberpunk** stílusú raktárkészlet-kezelő webalkalmazás (PWA), amelyet kifejezetten üzletberendezések (sztenderek, vállfák, árazók) nyilvántartására terveztek.

> 🚀 **Kulcs-Soft ERP Kompatibilis** | 📱 **PWA Támogatás** | 🔐 **Supabase Backend & RLS Security**

---

## ✨ Legújabb Funkciók (v35.0)

- [x] **Irányítópult (Dashboard)**: Bejelentkezés után egy statisztikai áttekintő fogad (Összes termék, Kritikus készlet, Kiemelt kategória).
- [x] **Kiberbiztonság (RLS & Hashing)**: A jelszavak SHA-256 algoritmussal titkosítottak, az adatbázis megóvásáról pedig a Supabase Row Level Security (RLS) gondoskodik.
- [x] **Adminisztrátori Mód & Saját UI Ablakok**: Kizárólag az adminok módosíthatják a készletet egy egyedi, Cyberpunk stílusú megerősítő panellel.
- [x] **Tesztelői (QA) Naplózás**: Biztonsági folyamatmegszakítások (pl. TC-03, TC-04) rögzítése a fejlesztői konzolban.
- [x] **Biztonságos Regisztráció**: E-mail alapú fiók létrehozása. Újbóli megnyitáskor automatikus mezőürítés és jelszó-elrejtés.
- [x] **ERP Szinkron Jelzés**: Élő visszajelzés az utolsó adatszinkronizáció időpontjáról.
- [x] **Okos Termékfotók**: Automatikus képkeresés és intelligens neon placeholder rendszer.

---

## 🏗️ Rendszer Architektúra és Szinkronizáció

A rendszer integrációs tervezése során a **Kulcs-Soft ERP** lett kijelölve elsődleges adatforrásnak ("Master Database"). 
Ennek értelmében a webes felületen (VisualStock) szándékosan **nincs lehetőség új termékek rögzítésére vagy törlésére**. A weblap elsődleges funkciója a gyors raktári navigáció és az egyes termékek készletszintjének precíz, helyszíni felülírása/korrigálása. Új termék bevezetése minden esetben a Kulcs-Soft rendszerből indul, amelyet a backend robotok szinkronizálnak a Supabase felhőbe.

---

## 📸 Képernyőképek

### 🏠 Irányítópult & Terméklista
![Dashboard](Dashboard.png)

### 🔐 Bejelentkezés & Regisztráció
![Login](Login.png)

### 💳 Termékkártyák (Adatok és Fotók)
![Product Cards](Termek_kartyak.png)

---

## 🛠️ Technológiai Háttér

- **Frontend**: HTML5, Vanilla CSS3, JavaScript (ES6+).
- **Backend / DB**: Supabase (PostgreSQL, Row Level Security).
- **Képforrás**: Vallfa.hu integráció.
- **Ikonok**: [Phosphor Icons](https://phosphoricons.com/).
- **Betűtípus**: [Outfit](https://fonts.google.com/specimen/Outfit).

---

## 🔐 Hozzáférés és Jogosultságok

A biztonság érdekében megszűnt az automatikus admin belépési kód! 

| Szerepkör | Létrehozás Módja | Jogosultság |
|:---:|:---:|:---:|
| **User (Alapfok)** | Szabad regisztráció a weblapon | Csak Olvasás (Böngészés) |
| **Admin** | Supabase `felhasznalok` táblában a `role` mező `admin`-ra állításával | Teljes (Készlet módosítás, Szinkron) |

---

## 🔐 Teszteléshez és Vizsgáztatáshoz (Demo Accounts)

A funkciók (TC-01, TC-02, TC-03, TC-04) kipróbálásához az alábbi tesztfiókok állnak rendelkezésre:

**Adminisztrátori hozzáférés (Teljes jogosultság, raktárkészlet módosítása):**
* Felhasználónév: `vizsga_admin`
* Jelszó: `Vizsga2026!`

**Felhasználói hozzáférés (Csak megtekintés, rejtett gombok):**
* Felhasználónév: `vizsga_user`
* Jelszó: `Vizsga2026!`

---

## 🔗 Élő Elérés
🌐 **Weboldal:** [https://visualstock-vizsga.vercel.app/](https://visualstock-vizsga.vercel.app/)

---

## 🛠️ Futtatás és Üzembe helyezés

Az alkalmazás teljes mértékben felhőalapú (Supabase backend), így a futtatásához nincs szükség helyi szerver (localhost) telepítésére.

* **Élő verzió:** [visualstock-vizsga.vercel.app](https://visualstock-vizsga.vercel.app/) (A Vercel hosting automatikusan, a GitHubra történő 'push' után frissül).

* **Helyi tesztelés:** A tároló klónozása (vagy letöltése) után az `index.html` fájl bármely modern böngészőben közvetlenül megnyitható és futtatható.

> [!IMPORTANT]
> **FONTOS MEGJEGYZÉS AZ ADATBIZTONSÁGRÓL:** Az adatbázis illetéktelen hozzáférés elleni védelmét a Supabase RLS (Row Level Security) házirendjei biztosítják, amelyek az élő szerveren már aktívak. A beállított biztonsági szabályok kódja ellenőrzés céljából a repository-ban található `supabase_security.sql` fájlban tekinthető meg.

## 📱 Mobilos Használat (PWA)
1. Nyisd meg a fenti **Vercel** linket Chrome/Edge böngészőben.
2. Koppints a **"Telepítés"** vagy **"Hozzáadás a főképernyőhöz"** gombra.
3. Indítsd el az alkalmazást közvetlenül a telefonodról!

---

## 👥 Készítők
**Bujdosó Rita**, **Kunszt Viktor**, **Makkai Rebeka**

---

© 2026 VisualStock Premium - V35.0 (QA & UI Update)
