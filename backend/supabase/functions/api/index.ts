import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { supabaseClient } from "./supabaseClient.ts";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple hash implementation (matches frontend logic)
async function hashPassword(password: string) {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Route: LOGIN
    if (req.method === 'POST' && pathname.endsWith('/login')) {
      const { username, password } = await req.json();
      const hashedPass = await hashPassword(password);
      
      const { data, error } = await supabaseClient
        .from('felhasznalok')
        .select('*')
        .or(`username.eq.${username},email.eq.${username}`)
        .eq('password', hashedPass)
        .single();
        
      if (error || !data) {
        return new Response(JSON.stringify({ error: "Hibás adatok vagy jelszó!" }), { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ user: data }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Route: REGISTER
    if (req.method === 'POST' && pathname.endsWith('/register')) {
      const { username, email, password } = await req.json();
      const hashedPass = await hashPassword(password);
      
      const { data, error } = await supabaseClient
        .from('felhasznalok')
        .insert([{ username, email, password: hashedPass, role: 'user' }]);

      if (error) {
        return new Response(JSON.stringify({ error: error.message, code: error.code }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ success: true }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Route: FETCH PRODUCTS
    if (req.method === 'GET' && pathname.endsWith('/products')) {
      const { data, error } = await supabaseClient
        .from('termekek')
        .select('*')
        .order('nev', { ascending: true });
        
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ products: data }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Route: BULK UPDATE
    if (req.method === 'POST' && pathname.endsWith('/update-bulk')) {
      const { updates } = await req.json(); // Array of { cikkszam, db }
      
      let sikeresMentesek = 0;
      for (const update of updates) {
          const { data, error } = await supabaseClient
             .from('termekek')
             .update({ db: update.db })
             .eq('cikkszam', update.cikkszam)
             .select();
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
    }

    // Fallback 404 route
    return new Response(JSON.stringify({ error: "Útvonal (Route) nem található." }), { 
      status: 404, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
