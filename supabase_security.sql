-- =========================================================================
-- VISUALSTOCK - BIZTONSÁGI HÁZIRENDEK / RLS (Row Level Security) CONFIG
-- Verzió: v36.1
-- =========================================================================
-- Deployment: Ez a szkript a Supabase SQL szerkesztőjében futtatandó,
-- a tábla szintű jogosultságok érvényesítéséhez.
-- =========================================================================

-- 1. Biztonsági réteg aktiválása az adathalmazra (RLS Enforcement)
ALTER TABLE felhasznalok ENABLE ROW LEVEL SECURITY;
ALTER TABLE termekek ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- SYSTEM USERS (felhasznalok) POLICIES
-- =========================================================================

-- Clean-up a módosítások előtti konfliktusok elkerüléséhez
DROP POLICY IF EXISTS "Barki regisztralhat" ON felhasznalok;
DROP POLICY IF EXISTS "A rendszer olvashatja bejelentkezeskor" ON felhasznalok;

-- A: Regisztrációs API nyitása (Anonymous INSERT privilege)
CREATE POLICY "Barki regisztralhat"
ON felhasznalok
FOR INSERT 
TO public
WITH CHECK (true);

-- B: Auth Query olvasási jog
-- Biztonsági megjegyzés: A custom auth megoldásunk miatt a kliens az anon key-el végzi 
-- a hitelesítési lekérdezéseket. Production környezetben ehhez szigorúbb JWT Auth policy javasolt.
CREATE POLICY "A rendszer olvashatja bejelentkezeskor"
ON felhasznalok
FOR SELECT
TO public
USING (true);

-- =========================================================================
-- INVENTORY (termekek) POLICIES
-- =========================================================================

DROP POLICY IF EXISTS "Mindenki olvashatja a termekeket" ON termekek;
DROP POLICY IF EXISTS "Barki modosihatja a keszletet" ON termekek;

-- A: Snapshot lekérdezés (Public Read Access)
CREATE POLICY "Mindenki olvashatja a termekeket"
ON termekek
FOR SELECT
TO public
USING (true);

-- B: Készlet mutáció (Public Update Access)
-- Logika: A finomhangolt jogosultság-ellenőrzés az Edge Function-ben történik.
-- Mivel serverless funkciók hajtják végre az updatet frontend anon key-jel (vagy anon REST-tel), 
-- az adatbázis RLS szabályát nyitva kell hagynunk. Ezt az API réteg korlátozza be.
CREATE POLICY "Barki modosihatja a keszletet"
ON termekek
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- =========================================================================
-- RBAC ADMIN ESCALATION OVERRIDE (VIZSGAKÖZPONTÚ JOGOSULTSÁG KIOSZTÁS)
-- =========================================================================
-- FELHASZNÁLÓI SZEREPKÖRÖK KEZELÉSE (Példa adatok):
-- Alapértelmezés szerint mindenki 'reader' jogosultságot kap.
-- Az alábbi parancsokkal lehet a tesztfiókokat magasabb szintre emelni:

-- UPDATE felhasznalok SET role = 'admin' WHERE username = 'vizsga_admin';
-- UPDATE felhasznalok SET role = 'editor' WHERE username = 'vizsga_editor';
-- AUDIT TRAIL (inventory_logs) POLICIES
-- =========================================================================


ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;

-- API driven Insert policy az Edge Function számára
CREATE POLICY "Barki naplozhat módosítást"
ON inventory_logs
FOR INSERT
TO public
WITH CHECK (true);

-- Telemetry Query Access 
CREATE POLICY "Napló olvasása"
ON inventory_logs
FOR SELECT
TO public
USING (true);
