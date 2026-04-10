const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
  const { data, error } = await supabase.from('territories').select('id');
  if (data) {
     for (const t of data) {
         // Same logic as syncTerritoryOwner
         const { data: activeAppointments } = await supabase
           .from('assignments')
           .select('user_id, status')
           .eq('territory_id', t.id)
           .eq('status', 'active')
           .order('assigned_at', { ascending: false }).limit(1);
         const { data: lastComps } = await supabase
           .from('assignments')
           .select('completed_at')
           .eq('territory_id', t.id)
           .eq('status', 'completed')
           .order('completed_at', { ascending: false }).limit(1);

         const lastCompletedAt = lastComps && lastComps.length > 0 ? lastComps[0].completed_at : null;

         if (activeAppointments && activeAppointments.length > 0) {
            await supabase.from('territories').update({ assigned_to: activeAppointments[0].user_id, status: 'assigned', last_completed_at: lastCompletedAt }).eq('id', t.id);
         } else {
            await supabase.from('territories').update({ assigned_to: null, status: 'available', last_completed_at: lastCompletedAt }).eq('id', t.id);
         }
     }
  }
}
fix();
