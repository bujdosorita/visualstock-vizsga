-- =========================================================================
-- VISUALSTOCK - SUPABASE BIZTONSÁGI BEÁLLÍTÁSOK (RLS)
-- =========================================================================
-- Ezt a kódot a Supabase SQL Editorjában (https://supabase.com/dashboard/project/_/sql)
-- kell egy új Query beillesztésével lefuttatnod.
-- =========================================================================

-- 1. Engedélyezzük a sor-szintű biztonságot (Row Level Security) a táblákon
ALTER TABLE felhasznalok ENABLE ROW LEVEL SECURITY;
ALTER TABLE termekek ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- FELHASZNÁLÓK TÁBLA (felhasznalok) HÁZIRENDJEI
-- =========================================================================

-- Töröljük a régi házirendeket (ha újra lefuttatnád a scriptet)
DROP POLICY IF EXISTS "Barki regisztralhat" ON felhasznalok;
DROP POLICY IF EXISTS "A rendszer olvashatja bejelentkezeskor" ON felhasznalok;

-- A: Bárki regisztrálhat fiókot (INSERT jogosultság minden anon számára)
CREATE POLICY "Barki regisztralhat"
ON felhasznalok
FOR INSERT 
TO public
WITH CHECK (true);

-- B: Csak szűrt lekérdezéssel lehessen bejelentkezni, ne lehessen a teljes listát lekérni
-- Trükk: A Supabase az anon kulccsal mindenkit beenged olvasásra, de ha nem adunk meg 
-- általános SELECT policy-t, senki sem tud adatot kinyerni. A biztonság miatt 
-- megengedjük az olvasást, de kizárólag a bejelentkezéshez (bár frontenden történő auth esetén
-- az anon read sajnos muszáj maradjon, de javasolt áttérni a Supabase Auth-ra).
-- Mivel a frontend direktben SELECT-el keresi a felhasználót (or(...) és eq(...)), 
-- a táblát egyelőre olvashatóvá tesszük, de kérlek fontold meg a Supabase Auth használatát a jövőben.
CREATE POLICY "A rendszer olvashatja bejelentkezeskor"
ON felhasznalok
FOR SELECT
TO public
USING (true);

-- =========================================================================
-- TERMÉKEK TÁBLA (termekek) HÁZIRENDJEI
-- =========================================================================

-- Töröljük a régi házirendeket
DROP POLICY IF EXISTS "Mindenki olvashatja a termekeket" ON termekek;
DROP POLICY IF EXISTS "Barki modosihatja a keszletet" ON termekek;

-- A: Mindenki olvashatja a termékeket (olvasási jogosultság)
CREATE POLICY "Mindenki olvashatja a termekeket"
ON termekek
FOR SELECT
TO public
USING (true);

-- B: Készlet módosítása. 
-- HIVATALOS MEGOLDÁS: Mivel nincsen Supabase Auth token, a Supabase nem tudja ki az "admin".
-- Így jelen formában engedélyeznünk kell az UPDATE-t mindenkinek a publikus kulccsal. 
-- A frontend védi a gombot (hogy csak Admin látja), de maga az API nyitott marad.
CREATE POLICY "Barki modosihatja a keszletet"
ON termekek
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- =========================================================================
-- HOGYAN LEGYÉL ADMIN? (MANUÁLIS MŰVELET)
-- =========================================================================
-- 1. Regisztrálj be a VisualStock oldalon (mint bármelyik normál felhasználó).
-- 2. Menj be a Supabase Table Editorjába (felhasznalok tábla).
-- 3. Keresd meg a saját sorodat, és a "role" oszlopban az értéket írd át 'user'-ről 'admin'-ra.
-- 4. Kattints a "Save" gombra, és lépj be újra az oldalon!
