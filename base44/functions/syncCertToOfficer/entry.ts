import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const FIREARM_PREFIXES = ["07", "08", "09", "10"];

// Renewal periods in months: firearms = 12 months, all other DCJS = 24 months
function getRenewalMonths(courseId) {
  if (FIREARM_PREFIXES.some(p => courseId?.startsWith(p))) return 12;
  return 24;
}

// Add months to a date string (YYYY-MM-DD) and return YYYY-MM-DD
function addMonths(dateStr, months) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { certificate_id } = await req.json();
    if (!certificate_id) return Response.json({ error: 'certificate_id required' }, { status: 400 });

    // Fetch the certificate
    const cert = await base44.asServiceRole.entities.TrainingCertificate.get(certificate_id);
    if (!cert) return Response.json({ error: 'Certificate not found' }, { status: 404 });

    // Only sync issued or approved certificates
    if (cert.status !== 'issued' && cert.status !== 'approved') {
      return Response.json({ synced: false, reason: `Certificate status is ${cert.status}, not issued/approved` });
    }

    // Find the officer by email, or fall back to matching by name
    let officer = null;
    if (cert.student_email) {
      const usersByEmail = await base44.asServiceRole.entities.User.filter({ email: cert.student_email });
      officer = usersByEmail && usersByEmail[0];
    }
    if (!officer && cert.student_name) {
      // Try to find by full_name match (case-insensitive, trimmed)
      const cleanName = cert.student_name.trim().toLowerCase();
      const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 500);
      officer = allUsers.find(u => {
        const fullName = (u.full_name || '').trim().toLowerCase();
        const firstLast = `${(u.first_name || '').trim()} ${(u.last_name || '').trim()}`.trim().toLowerCase();
        return fullName === cleanName || firstLast === cleanName;
      });
    }
    if (!officer) {
      return Response.json({ synced: false, reason: `Officer not found (email: "${cert.student_email}", name: "${cert.student_name}")` });
    }

    const isFirearm = FIREARM_PREFIXES.some(p => (cert.course_id || '').startsWith(p));
    const isDcjsCourse = /^\d/.test(cert.course_id || '');
    const renewalMonths = getRenewalMonths(cert.course_id);
    const completionDate = cert.completion_date || cert.issue_date || '';
    const expirationDate = addMonths(completionDate, renewalMonths);

    // Build the new certification entry
    const newCert = {
      course_id: cert.course_id || '',
      training_name: cert.course_title || '',
      category: isDcjsCourse ? 'dcjs' : 'company',
      status: 'active',
      issue_date: completionDate,
      expiration_date: expirationDate,
      renewal_period_months: renewalMonths,
      certificate_number: cert.certificate_number || '',
      cert_file_url: '',
      notes: `Auto-synced from training portal — ${cert.training_type || ''} ${cert.course_id || ''}`.trim(),
      manually_verified: true,
    };

    // Load existing certifications
    const existingCerts = Array.isArray(officer.officer_certifications) ? officer.officer_certifications : [];

    // Check if this cert is already synced (match by certificate_number or course_id + issue_date)
    const matchIdx = existingCerts.findIndex(c =>
      (c.certificate_number && c.certificate_number === newCert.certificate_number) ||
      (c.course_id === newCert.course_id && c.issue_date === newCert.issue_date)
    );

    let updatedCerts;
    if (matchIdx >= 0) {
      const existing = existingCerts[matchIdx];
      // Always fix stale data: wrong expiration date, missing renewal_period_months, missing training_name
      updatedCerts = existingCerts.map((c, i) => i === matchIdx ? {
        ...c,
        training_name: c.training_name || newCert.training_name,
        expiration_date: expirationDate,
        renewal_period_months: renewalMonths,
        certificate_number: c.certificate_number || newCert.certificate_number,
        manually_verified: true,
      } : c);
    } else {
      updatedCerts = [...existingCerts, newCert];
    }

    // Recompute DCJS and Firearm expiration dates from ALL certs
    const dcjsCore = updatedCerts.find(c => c.course_id?.startsWith('01') && c.expiration_date);
    let dcjsExpiration = dcjsCore?.expiration_date || '';
    if (!dcjsExpiration) {
      const dcjsCerts = updatedCerts.filter(c => c.category === 'dcjs' && c.expiration_date);
      if (dcjsCerts.length > 0) {
        dcjsExpiration = [...dcjsCerts].sort((a, b) => new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime())[0].expiration_date;
      }
    }

    const firearmCerts = updatedCerts.filter(c =>
      FIREARM_PREFIXES.some(p => c.course_id?.startsWith(p)) && c.expiration_date
    );
    let firearmExpiration = '';
    if (firearmCerts.length > 0) {
      firearmExpiration = [...firearmCerts].sort((a, b) => new Date(b.expiration_date).getTime() - new Date(a.expiration_date).getTime())[0].expiration_date;
    }

    const updateData = {
      officer_certifications: updatedCerts,
      dcjs_expiration: dcjsExpiration || null,
      firearm_expiration: firearmExpiration || null,
    };

    await base44.asServiceRole.entities.User.update(officer.id, updateData);

    // Clear stale certification alerts (CertificationTodo) that are no longer expiring
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000;

    const staleAlerts = await base44.asServiceRole.entities.CertificationTodo.filter({
      officer_email: officer.email,
      completed: false,
    });

    for (const alert of staleAlerts) {
      const expDate = alert.certification_type === 'dcjs' ? dcjsExpiration : firearmExpiration;
      if (!expDate) continue;
      const diff = new Date(expDate).getTime() - today.getTime();
      if (diff > SIXTY_DAYS) {
        await base44.asServiceRole.entities.CertificationTodo.update(alert.id, {
          completed: true,
          notes: 'Auto-completed: certification renewed via training portal sync',
        });
      }
    }

    return Response.json({
      synced: true,
      officer: officer.email,
      certAdded: newCert.training_name,
      dcjsExpiration,
      firearmExpiration,
      isFirearm,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});