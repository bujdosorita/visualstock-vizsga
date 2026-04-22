# Kulcs-Soft Integrációs Stratégia

Mivel a valós ERP rendszerhez (Kulcs-Soft) nincs közvetlen hozzáférésed a fejlesztés során, a VisualStock-ot egy **köztes adatréteg (Supabase)** köré építettük fel. Ez a legmodernebb és legbiztonságosabb megközelítés.

## Hogyan fog működni élesben?

A kommunikáció nem közvetlenül a böngésző és a Kulcs-Soft között zajlik (biztonsági és hálózati okokból), hanem egy úgynevezett **Szinkronizációs Bridge (Híd)** segítségével.

### 1. A Kommunikációs Lánc
`Kulcs-Soft` <---> `Sync Service (Python/Node.js)` <---> `Supabase` <---> `VisualStock App`

### 2. Integrációs módszerek a Kulcs-Soft oldalon
A Kulcs-Soft verziójától függően három út áll rendelkezésre:

*   **Kulcs-Connect API**: Ha rendelkeztek ezzel a modullal, a Sync Service szabványos JSON formátumban kéri le a készletadatokat.
*   **Közvetlen SQL elérés**: Ha a Kulcs-Soft saját szerveren fut (MS SQL), a Sync Service közvetlenül olvashatja a `Készlet` táblákat.
*   **Fájl alapú export (CSV/XML)**: A Kulcs-Soft beállítható, hogy időközönként exportálja a készletet egy mappába, amit a vizuális szoftverünk beolvas.

## Miért jó ez a megoldás?

1.  **Offline működés**: Ha a Kulcs-Soft szervere karbantartás miatt leáll, az appod akkor is mutatja az utolsó ismert készletet a Supabase-ből.
2.  **Sebesség**: A böngészőnek nem kell megvárnia a lassabb ERP válaszidejét, a Supabase azonnal kiszolgálja az adatokat.
3.  **Biztonság**: Nem kell az ERP adatbázisát az internetre kiengedned. Csak a Sync Service lát ki a tűzfal mögül a Supabase felé.

## Teendő az élesítéskor
Amikor meglesz a hozzáférés, csak egy kis "robotot" (scriptet) kell futtatni a szerveren, ami pl. 5 percenként lefuttat egy `UPDATE` parancsot a Supabase táblán a Kulcs-Soft adatai alapján.

> [!NOTE]
> A VisualStock frontend kódján (amit most írtunk) **semmit nem kell változtatni**, mert az továbbra is a Supabase-t fogja figyelni.
