export function getSupabase(){const url=window.SUPABASE_URL,key=window.SUPABASE_ANON_KEY;if(!url||!key||url.includes("COLE_AQUI")||key.includes("COLE_AQUI"))throw new Error("Supabase não configurado. Edite config.js.");return window.supabase.createClient(url,key)}
export const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
export const fmtDate=v=>v?new Date(v).toLocaleString("pt-BR"):"—";
export function fmtDur(sec){if(sec===null||sec===undefined)return"—";const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return `${String(h).padStart(2,"0")}:${String(Math.floor((sec%3600)/60)).padStart(2,"0")}:${String(s).padStart(2,"0")}`;}
