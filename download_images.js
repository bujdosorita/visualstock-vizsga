const fs = require('fs');
const path = require('path');

const API_URL = "https://ktmmhgmfzfqbwianrsbx.supabase.co/functions/v1/api/products";
const OUTPUT_DIR = path.join(__dirname, 'Lementett_Kepek');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

// A fallback logika a script.js-ből átemelve
function getUrlPatterns(sku) {
    return [
        `https://vallfa.hu/img/41068/${sku}/560x560,r/${sku}.jpg`,
        `https://vallfa.hu/img/41068/${sku}/500x500/${sku}.jpg`,
        `https://vallfa.hu/shop_ordered/41068/shop_altkep/${sku}.jpg`,
        `https://vallfa.hu/shop_ordered/41068/shop_altkep/${sku}_altkep_1.jpg`,
        `https://vallfa.hu/shop_ordered/41068/pic/${sku}.jpg`
    ];
}

// Hardcoded kivételek a script.js-ből
function getHardcodedUrl(cikkszam) {
    if (cikkszam === '601056') return 'https://vallfa.hu/img/41068/601045T/560x560,r/601045T.jpg'; 
    if (cikkszam === '601045TRUD') return 'https://vallfa.hu/img/41068/601045T/560x560,r/601045T.jpg';
    if (cikkszam === '601047TFEKEZ') return 'https://vallfa.hu/img/41068/601047TFEKEZ/560x560,r/601047TFEKEZ.jpg';
    if (cikkszam === '601047SONG160') return 'https://vallfa.hu/img/41068/601047SONG160/560x560,r/601047SONG160.jpg';
    if (cikkszam === '6010414FT') return 'https://vallfa.hu/img/41068/6010414FT/560x560,r/6010414FT.jpg';
    if (cikkszam === '6010395FT') return 'https://vallfa.hu/img/41068/6010395FT/560x560,r/6010395FT.jpg';
    if (cikkszam === '6010406FT') return 'https://vallfa.hu/img/41068/6010406FT/560x560,r/6010406FT.jpg';
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
    
    if (cikkszam && (cikkszam.match(/^[a-zA-Z0-9-]+$/))) {
        return `https://vallfa.hu/img/41068/${cikkszam}/560x560,r/${cikkszam}.jpg`;
    }
    return null;
}

// A letöltő gépezet
async function downloadImage(sku, urls) {
    for (const url of urls) {
        try {
            const res = await fetch(url);
            if (res.ok) {
                const buffer = await res.arrayBuffer();
                // Ha nagyobb mint 1KB, akkor valódi kép (nem törött pixel)
                if (buffer.byteLength > 1000) { 
                    fs.writeFileSync(path.join(OUTPUT_DIR, `${sku}.jpg`), Buffer.from(buffer));
                    console.log(`✅ Sikeresen letöltve: ${sku} [${url}]`);
                    return true;
                }
            }
        } catch (e) {
            // Megyünk a következő URL-re
        }
    }
    console.log(`❌ Nincs fent ez a kép a Vallfa szerverein: ${sku}`);
    return false;
}

async function start() {
    console.log("📥 Kapcsolódás a friss API-hoz a terméklista lekérésére...");
    const res = await fetch(API_URL);
    if (!res.ok) {
        console.error("API Hiba! Valószínűleg nem fut az Edge Function megfelelően.");
        return;
    }
    const data = await res.json();
    const products = data.products;
    
    console.log(`📦 ${products.length} termék található az adatbázisban. \n🚀 Képek letöltése indítva...`);
    
    for (let i = 0; i < products.length; i++) {
        const p = products[i];
        if(!p.cikkszam) continue;
        
        let urlsToTry = [];
        const hc = getHardcodedUrl(p.cikkszam);
        if (hc) urlsToTry.push(hc);
        urlsToTry = urlsToTry.concat(getUrlPatterns(p.cikkszam));
        
        await downloadImage(p.cikkszam, urlsToTry);
        
        // Tartunk egy pici szünetet (100ms), hogy ne terheljük túl a vallfa.hu-t és ne tiltsanak ki a szerverről DDoS miatt.
        await new Promise(r => setTimeout(r, 100));
    }
    
    console.log("=====================================");
    console.log("🎉 KÉSZ! Az összes sikeresen megtalálható kép elmentve a 'Lementett_Kepek' mappába.");
    console.log("Lépj be a Supabase Storage-be, és húzd be a mappa tartalmát a 'termek-kepek' Bucket-be!");
    console.log("A scipt fájlt (download_images.js) most már törölheted.");
}

start();
