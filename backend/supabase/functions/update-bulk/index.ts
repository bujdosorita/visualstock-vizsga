import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  try {
    const { updates, username, role } = await req.json(); // Type: Array<{cikkszam: string, db: number}>
    
    // RBAC: Jogosultsági réteg (Authorization guard)
    if (role !== 'admin' && role !== 'editor') {
      return new Response(JSON.stringify({ error: "Nincs jogosultságod a módosításhoz!" }), { 
        status: 403, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let sikeresMentesek = 0;
    for (const update of updates) {
        // Tényadat in-flight lekérdezése (Audit trailezhető delta számításhoz)
        const { data: termek } = await supabaseClient
           .from('termekek')
           .select('db')
           .eq('cikkszam', update.cikkszam)
           .single();
           
        const oldQty = termek ? termek.db : 0;

        // UPSERT fallback - Raktárkészlet tranzakcionális mutációja
        const { error: updateError } = await supabaseClient
           .from('termekek')
           .update({ db: update.db })
           .eq('cikkszam', update.cikkszam);
           
        if (updateError) {
           return new Response(JSON.stringify({ error: updateError.message }), { 
             status: 500, 
             headers: { ...corsHeaders, 'Content-Type': 'application/json' }
           });
        }
        
        // Audit log inzertálása delta diverzifikánál
        if (oldQty !== update.db) {
           await supabaseClient
             .from('inventory_logs')
             .insert([{ 
               username: username || 'Ismeretlen', 
               cikkszam: update.cikkszam, 
               old_qty: oldQty, 
               new_qty: update.db 
             }]);
        }

        sikeresMentesek++;
    }
    return new Response(JSON.stringify({ success: true, count: sikeresMentesek }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
