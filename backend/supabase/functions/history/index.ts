import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  try {
    // Csak POST kérést engedélyezünk a biztonság érdekében
    if (req.method !== 'POST') {
       return new Response(JSON.stringify({ error: "Method not allowed" }), { 
         status: 405, 
         headers: { ...corsHeaders, 'Content-Type': 'application/json' }
       });
    }

    const { role } = await req.json();
    
    if (role !== 'admin') {
      return new Response(JSON.stringify({ error: "Nincs jogosultságod az előzmények olvasásához!" }), { 
        status: 403, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: logs, error } = await supabaseClient
       .from('inventory_logs')
       .select('*')
       .order('created_at', { ascending: false })
       .limit(50);
       
    if (error) {
       return new Response(JSON.stringify({ error: error.message }), { 
         status: 500, 
         headers: { ...corsHeaders, 'Content-Type': 'application/json' }
       });
    }

    return new Response(JSON.stringify({ logs }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
