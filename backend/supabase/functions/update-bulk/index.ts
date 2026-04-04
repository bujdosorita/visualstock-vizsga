import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { updates } = await req.json(); // Array of { cikkszam, db }
    
    let sikeresMentesek = 0;
    for (const update of updates) {
        const { error } = await supabaseClient
           .from('termekek')
           .update({ db: update.db })
           .eq('cikkszam', update.cikkszam);
           
        if (error) {
           return new Response(JSON.stringify({ error: error.message }), { 
             status: 500, 
             headers: { ...corsHeaders, 'Content-Type': 'application/json' }
           });
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
