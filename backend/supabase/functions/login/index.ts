import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { hashPassword } from "../_shared/hashing.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
