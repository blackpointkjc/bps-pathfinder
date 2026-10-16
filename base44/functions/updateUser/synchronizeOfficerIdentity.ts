export async function synchronizeOfficerIdentity(entities: any, user: any) {
  const emails = [...new Set([user.email,user.work_email,user.pathfinder_email,...(user.email_aliases || [])].filter(Boolean).map((v: any) => String(v).trim().toLowerCase()))];
  const warnings: string[] = [];
  const identity = { rank: user.rank || '', unit_number: String(user.unit_number || '') };
  for (const [name,query] of [['OfficerRoster',{ email: { $in:emails } }],['ActiveOfficer',{ officer_email: { $in:emails } }],['Unit',{ user_id:user.id }]] as const) {
    try {
      const rows = await entities[name].filter(query, '-updated_date', 1000);
      for (const row of rows || []) {
        const fields = name === 'Unit' ? { unit_id:identity.unit_number, label:[identity.rank,user.last_name].filter(Boolean).join(' ') || user.full_name || user.email } : identity;
        const patch = Object.fromEntries(Object.entries(fields).filter(([key,value]) => String(row[key] ?? '') !== String(value)));
        if (Object.keys(patch).length) await entities[name].update(row.id, patch);
      }
    } catch (error: any) { warnings.push(name + ' identity sync needs retry.'); console.warn(name + ' identity sync failed',error?.message); }
  }
  return warnings;
}
