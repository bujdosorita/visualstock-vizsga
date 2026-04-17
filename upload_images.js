const fs = require('fs');
const path = require('path');

// ============================================================
// !! IDE ÍRD BE A SUPABASE SERVICE ROLE KEY-T !!
// Megtalálod: Supabase Dashboard → Project Settings → API → service_role (secret)
// !! SOHA NE TÖLTSD FEL GITHUBRA EZZEL A KEY-JEL !!
// ============================================================
const SUPABASE_URL = "https://ktmmhgmfzfqbwianrsbx.supabase.co";
const SERVICE_ROLE_KEY = "IDE_ILLESZD_BE_A_SERVICE_ROLE_KEY_T";
const BUCKET_NAME = "termek_kepek";
const IMAGES_DIR = path.join(__dirname, 'Lementett_Kepek');

// Ellenőrzés
if (SERVICE_ROLE_KEY === "IDE_ILLESZD_BE_A_SERVICE_ROLE_KEY_T") {
    console.error("❌ HIBA: Nem adtad meg a Service Role Key-t! Szerkeszd a fájlt és illeszd be a kulcsot.");
    process.exit(1);
}

async function uploadImage(fileName, fileBuffer) {
    const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${fileName}`;
    
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'image/jpeg',
            'x-upsert': 'true'  // Ha már létezik, felülírja (nem dob hibát)
        },
        body: fileBuffer
    });

    if (res.ok) {
        return true;
    } else {
        const err = await res.text();
        throw new Error(`HTTP ${res.status}: ${err}`);
    }
}

async function start() {
    // Összes .jpg fájl listázása
    const files = fs.readdirSync(IMAGES_DIR).filter(f => 
        f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.png')
    );

    console.log(`🚀 ${files.length} kép feltöltése indul a '${BUCKET_NAME}' bucket-be...\n`);

    let sikeres = 0;
    let hibas = 0;

    for (let i = 0; i < files.length; i++) {
        const fileName = files[i];
        const filePath = path.join(IMAGES_DIR, fileName);
        const fileBuffer = fs.readFileSync(filePath);

        try {
            await uploadImage(fileName, fileBuffer);
            sikeres++;
            console.log(`✅ [${i + 1}/${files.length}] ${fileName}`);
        } catch (e) {
            hibas++;
            console.error(`❌ [${i + 1}/${files.length}] HIBA: ${fileName} → ${e.message}`);
        }

        // Kis szünet, hogy ne terheljük túl a Supabase API-t
        await new Promise(r => setTimeout(r, 50));
    }

    console.log("\n=====================================");
    console.log(`🎉 Feltöltés kész!`);
    console.log(`   ✅ Sikeres: ${sikeres} kép`);
    if (hibas > 0) {
        console.log(`   ❌ Hibás:   ${hibas} kép`);
    }
    console.log("=====================================");
    console.log("\n⚠️  Töröld a SERVICE_ROLE_KEY-t ebből a fájlból, vagy töröld magát a fájlt!");
}

start();
