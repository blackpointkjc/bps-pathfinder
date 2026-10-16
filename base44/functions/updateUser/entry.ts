import { normalizeRank, PAY_RANGES, nextUnitNumber } from './rankPolicy.ts';
import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        const roles = new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));
        if (!user || (user.role !== 'admin' && !roles.has('full_access') && !roles.has('hr') && !roles.has('trainer'))) {
            return Response.json({ error: 'Unauthorized - account management access required' }, { status: 401 });
        }

        const { userId, updates } = await req.json();
        
        if (!userId || !updates) {
            return Response.json({ error: 'userId and updates required' }, { status: 400 });
        }

        console.log('📝 Updating user:', userId);
        // Never log submitted profile fields or sensitive identification details.

        // Update the user's profile using asServiceRole
        const targetUsers = await base44.asServiceRole.entities.User.list(undefined, 1000);
        const target = (targetUsers || []).find((entry: any) => entry.id === userId);
        if (!target) return Response.json({ error: 'User not found' }, { status: 404 });
        const targetRoles = new Set((target.additional_roles || []).map((role: string) => String(role).toLowerCase()));
        const isSystemManager = user.role === 'admin' || roles.has('full_access');
        const internalEmployeeRoles = ['cad_access','officer','supervisor','hr','accounting','trainer','support_staff'];
        const isInternalEmployee = target.role === 'admin' || internalEmployeeRoles.some(role => targetRoles.has(role)) || ['support staff', 'human resources'].includes(String(target.rank || '').toLowerCase());
        if (!isSystemManager && roles.has('hr') && !isInternalEmployee) return Response.json({ error: 'HR can manage company employee accounts only' }, { status: 403 });
        if (!isSystemManager && roles.has('trainer') && !targetRoles.has('student')) return Response.json({ error: 'Trainer can manage student accounts only' }, { status: 403 });
        if (!isSystemManager && updates.role !== undefined) return Response.json({ error: 'Only Admin or Full Access can change system administrator status' }, { status: 403 });
        if (!isSystemManager && updates.additional_roles !== undefined) {
            return Response.json({ error: 'Only Admin or Full Access can change account roles' }, { status: 403 });
        }
        // Trainers manage student education records, never payroll, employment,
        // officer access, or personal identity verification data.
        if (!isSystemManager && roles.has('trainer')) {
            const allowed = new Set(['first_name','last_name','full_name','date_of_birth','dcjs_number','dcjs_expiration','firearm_expiration','officer_certifications']);
            const forbidden = Object.keys(updates || {}).filter(field => !allowed.has(field));
            if (forbidden.length) return Response.json({ error: 'Trainer updates are limited to student training and course identity fields' }, { status: 403 });
        }

        const updatePayload: Record<string, unknown> = {};
        const fields = ['first_name','last_name','full_name','email','mobile_phone','rank','unit_number','badge_number','division','subdivision','assigned_location','assigned_locations','assigned_sites','dispatch_role','is_supervisor','show_on_map','role','status','additional_roles','platoon','oversight_platoon','supervisor_id','supervisor_email','supervisor_name','next_level_supervisor_id','next_level_supervisor_email','next_level_supervisor_name','ssn','date_of_birth','address','city','state','zip','hire_date','termination_date','employment_status','hourly_rate','overtime_rate_override','holiday_rate_override','work_state','dcjs_number','dcjs_expiration','firearm_expiration','drivers_license_number','drivers_license_state','drivers_license_expiration','emergency_contact_name','emergency_contact_relationship','emergency_contact_phone','profile_photo_url','profile_photo_original_url','officer_certifications'];
        for (const f of fields) {
            if (updates[f] !== undefined) updatePayload[f] = updates[f];
        }

        if (updatePayload.oversight_platoon !== undefined) {
            if (!['A','B',''].includes(String(updatePayload.oversight_platoon))) return Response.json({error:'Platoon oversight must be A or B'},{status:400});
            if (String(updatePayload.rank || target.rank) !== 'Major') return Response.json({error:'Platoon oversight is assigned to Majors only'},{status:400});
            updatePayload.platoon = 'Command';
        }
        if (updatePayload.role !== undefined && !['user', 'admin'].includes(String(updatePayload.role))) {
            return Response.json({ error: 'Role must be user or admin' }, { status: 400 });
        }
        if (updatePayload.additional_roles !== undefined && !Array.isArray(updatePayload.additional_roles)) {
            return Response.json({ error: 'additional_roles must be an array' }, { status: 400 });
        }

        // Personnel assignment policy: badge is permanent on first Officer grant;
        // rank changes allocate within the configured rank series and reset rank pay.
        const oldRoles = new Set((target.additional_roles || []).map((v:any)=>String(v).toLowerCase()));
        const newRoles = new Set((Array.isArray(updatePayload.additional_roles) ? updatePayload.additional_roles : target.additional_roles || []).map((v:any)=>String(v).toLowerCase()));
        const officerNow = newRoles.has('officer');
        const officerNewlyGranted = officerNow && !oldRoles.has('officer');
        const operational = officerNow || newRoles.has('cad_access') || newRoles.has('supervisor');
        const rank = normalizeRank(updatePayload.rank || target.rank || 'Officer');
        const rankChanged = normalizeRank(target.rank) !== rank;
        if (updatePayload.rank !== undefined) updatePayload.rank = rank;
        if (operational) {
          if (!String(updatePayload.rank || target.rank || '').trim()) updatePayload.rank = rank;
          const payRange = PAY_RANGES[rank];
          if (payRange && (rankChanged || officerNewlyGranted)) {
            const requested = Number(updatePayload.hourly_rate);
            const intentionalRate = updatePayload.hourly_rate !== undefined && Number.isFinite(requested) && requested !== Number(target.hourly_rate);
            updatePayload.hourly_rate = intentionalRate ? Math.min(payRange.max, Math.max(payRange.min, requested)) : payRange.min;
          } else if (payRange && updatePayload.hourly_rate !== undefined) {
            const requested = Number(updatePayload.hourly_rate);
            if (!Number.isFinite(requested) || requested < 0) return Response.json({error:'Hourly rate must be a non-negative number'},{status:400});
            updatePayload.hourly_rate = Math.max(payRange.min, requested);
          }
          const reserved:Record<string,string> = {
            '6a72bbee2842d6338cbae513':'4001', // Colonel Hiers
            '6a406e7f5968db44ad597d61':'4002', // Lt Colonel Sherrill
            '6ac889ba810b2036456a6d24':'4003', // Lt Colonel Jones
            '6ad1a4589148f235c2c15623':'4004', // Sergeant Robinson
            '6ad1ab9d4b2e4e06c9916653':'4005', // Lieutenant Cook
          };
          const originalBadge = String(target.badge_number || '').trim();
          const usedBadges = new Set((targetUsers || []).filter((person:any)=>person.id !== userId).map((person:any)=>String(person.badge_number || '').trim()).filter(Boolean));
          if (reserved[userId]) {
            // Explicit one-time migration of the five founding badge identities.
            if (usedBadges.has(reserved[userId])) return Response.json({error:`Reserved badge ${reserved[userId]} is already assigned to another employee`},{status:409});
            updatePayload.badge_number = reserved[userId];
          } else if (originalBadge) {
            // All other issued badge numbers are immutable, including on promotion.
            updatePayload.badge_number = originalBadge;
          } else if (officerNewlyGranted) {
            const issued = (targetUsers || []).map((person:any)=>Number(String(person.badge_number || '').trim())).filter((n:number)=>Number.isSafeInteger(n) && n >= 4001);
            let next = Math.max(4005,...issued) + 1;
            while (usedBadges.has(String(next))) next++;
            updatePayload.badge_number = String(next);
          }
          if (rankChanged || (officerNewlyGranted && !String(target.unit_number || '').trim())) {
            try { updatePayload.unit_number = nextUnitNumber(rank, targetUsers, userId); }
            catch (error) { return Response.json({error:error.message},{status:409}); }
          } else if (String(target.unit_number || '').trim()) {
            updatePayload.unit_number = target.unit_number;
          }
        }
        await base44.asServiceRole.entities.User.update(userId, updatePayload);
        // Keep existing directory mirrors current without creating or deleting officers.
        const warnings: string[] = [];
        if (rankChanged || updatePayload.unit_number !== undefined) {
          try {
            const mirrors = await base44.asServiceRole.entities.OfficerRoster.filter({email:target.email}, '-updated_date', 1000);
            for (const mirror of mirrors || []) {
              await base44.asServiceRole.entities.OfficerRoster.update(mirror.id, {
                rank: updatePayload.rank || target.rank,
                unit_number: updatePayload.unit_number ?? target.unit_number,
                badge_number: updatePayload.badge_number ?? target.badge_number,
              });
            }
          } catch (error) {
            warnings.push('Account saved; public officer roster sync needs retry.');
            console.warn('Officer roster mirror sync failed', error?.message);
          }
        }


        // On the first admin approval of an officer, create an actionable
        // certification review for trainers without changing employee roles.
        const approvedRoles = Array.isArray(updatePayload.additional_roles) ? updatePayload.additional_roles.map((item:any) => String(item).toLowerCase()) : [];
        const officerJustApproved = isSystemManager && !targetRoles.has('officer') && approvedRoles.includes('officer');
        if (officerJustApproved) {
          try {
            const approvedOfficer = { ...target, ...updatePayload };
            const officerName = [approvedOfficer.first_name, approvedOfficer.last_name].filter(Boolean).join(' ').trim() || approvedOfficer.full_name || approvedOfficer.email || `Account ${userId}`;
            const trainers = (targetUsers || []).filter((person:any) => (person.additional_roles || []).includes('trainer'));
            const pending = await base44.asServiceRole.entities.Task.filter({ related_id: userId, related_type: 'general' }, '-created_date', 30);
            for (const trainer of trainers) {
              if (!trainer.id || (pending || []).some((task:any) => task.assigned_to === trainer.id && task.status !== 'completed')) continue;
              await base44.asServiceRole.entities.Task.create({
                title: 'Review new officer certifications',
                description: `Verify credentials, DCJS registration, firearm qualifications, expiration dates, and supporting files for ${officerName} (${approvedOfficer.email || userId}).`,
                status: 'open', priority: 'high', assigned_to: trainer.id,
                assigned_name: [trainer.first_name, trainer.last_name].filter(Boolean).join(' ').trim() || trainer.full_name || trainer.email || `Account ${trainer.id}`,
                related_type: 'general', related_id: userId,
                related_name: officerName,
              });
            }
          } catch (reviewError) {
            console.warn('Officer approved; trainer certification task creation needs retry', reviewError?.message);
          }
        }

        console.log('✅ User updated successfully');
        
        return Response.json({
            success: true,
            message: 'User updated successfully',
            warnings,
            user: {id:userId, rank:updatePayload.rank || target.rank, unit_number:updatePayload.unit_number ?? target.unit_number, hourly_rate:updatePayload.hourly_rate ?? target.hourly_rate}
        });
        
    } catch (error) {
        console.error('Error updating user:', error);
        return Response.json({ 
            error: 'Failed to update user',
            details: error.message 
        }, { status: 500 });
    }
});