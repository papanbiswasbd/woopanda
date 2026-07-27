/**
 * WooPanda WooCommerce Auth Relay - Cloudflare Worker
 * 
 * This worker acts as a secure bridge between WooCommerce (which sends keys via a server-side POST)
 * and the WooPanda Mobile App (which cannot directly receive server-side POST requests).
 * 
 * Deployment:
 * 1. Deploy this worker to Cloudflare (e.g. using `wrangler deploy` or pasting in the dashboard).
 * 2. Configure a KV Namespace named `WOOPANDA_KEYS` if deploying for production, or use
 *    the built-in memory fallback for low-traffic/testing.
 */

// Simple in-memory fallback cache (cleared when worker recycles)
const memoryCache = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Enable CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. Endpoint where WooCommerce server POSTs the generated keys
    if (url.pathname === '/callback' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { user_id, consumer_key, consumer_secret } = body;

        if (!user_id || !consumer_key || !consumer_secret) {
          return new Response(JSON.stringify({ error: 'Missing parameters' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        const data = JSON.stringify({ consumer_key, consumer_secret });

        // Save keys using KV if available, otherwise fallback to memory cache
        if (env.WOOPANDA_KEYS) {
          // Store key with a 5-minute expiration time for security
          await env.WOOPANDA_KEYS.put(user_id, data, { expirationTtl: 300 });
        } else {
          memoryCache.set(user_id, {
            data,
            expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes expiration
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // 2. Endpoint where the Mobile App polls to retrieve keys
    if (url.pathname === '/get-keys' && request.method === 'GET') {
      const userId = url.searchParams.get('user_id');

      if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing user_id' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      try {
        let keysData = null;

        if (env.WOOPANDA_KEYS) {
          keysData = await env.WOOPANDA_KEYS.get(userId);
          if (keysData) {
            // Delete immediately after reading (one-time handshake)
            await env.WOOPANDA_KEYS.delete(userId);
          }
        } else {
          const cached = memoryCache.get(userId);
          if (cached) {
            if (cached.expiresAt > Date.now()) {
              keysData = cached.data;
            }
            memoryCache.delete(userId); // One-time fetch (purge immediately)
          }
        }

        if (!keysData) {
          return new Response(JSON.stringify({ status: 'pending', message: 'Keys not received yet' }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        // Return credentials
        const parsed = JSON.parse(keysData);
        return new Response(JSON.stringify({ status: 'success', ...parsed }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  },
};
