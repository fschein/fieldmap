import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function run() {
  const { data: g } = await supabase.from('groups').select('id, name, color')
  console.log("Groups:", g)
  const { data: t } = await supabase.from('territories').select('id, name, color, group_id')
  
  // check if territory colors differ from group colors
  for (const terr of t) {
    if (terr.group_id) {
        const grp = g.find(x => x.id === terr.group_id)
        if (grp && grp.color !== terr.color) {
            console.log(`Mismatch: ${terr.name} has T-color ${terr.color} but group ${grp.name} has G-color ${grp.color}`)
        }
    }
  }
}
run()
