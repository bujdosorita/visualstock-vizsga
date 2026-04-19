import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { hashPassword } from "../_shared/hashing.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  try {
    const { username, password } = await req.json();
    const hashedPass = await hashPassword(password);
    
    // Először lekérjük a felhasználót a neve alapján (kis- és nagybetű függetlenül)
    const { data, error: dbError } = await supabaseClient
      .from('felhasznalok')
      .select('*')
      .ilike('username', username)
      .single();
      
    // Ha adatbázis hiba van
    if (dbError && dbError.code !== 'PGRST116') {
       return new Response(JSON.stringify({ error: `Adatbázis hiba: ${dbError.message}` }), { 
         status: 500, 
         headers: { ...corsHeaders, 'Content-Type': 'application/json' }
       });
    }

    // DEBUG: Ha nem találja a felhasználót
    if (!data) {
      return new Response(JSON.stringify({ error: "DEBUG: Felhasználó nem található!" }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const hashedPass = await hashPassword(password);
    
    // Ha megtalálta, de a jelszó nem stimmel
    if (data.password !== hashedPass && data.password !== password) {
      return new Response(JSON.stringify({ error: "DEBUG: Jelszó nem egyezik!" }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ user: data }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
