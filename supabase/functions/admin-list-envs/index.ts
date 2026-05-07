Deno.serve(() => {
  const keys = Object.keys(Deno.env.toObject())
    .filter((k) => k.startsWith("SUPABASE") || k.includes("KEY") || k.includes("JWT"))
    .map((k) => ({ name: k, len: Deno.env.get(k)?.length ?? 0, prefix: Deno.env.get(k)?.slice(0, 10) }));
  return new Response(JSON.stringify(keys, null, 2), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
});
