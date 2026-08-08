import { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInDays } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";

const FIREARM_PREFIXES = ["07", "08", "09", "10"];

export default function CertificationMonitor({ user }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const lastNotifiedRef = useRef('');

  // Poll for updated user data every 30s so server-side syncs are picked up
  const { data: freshUser } = useQuery({
    queryKey: ['certMonitorUser', user?.email],
    queryFn: () => base44.auth.me(),
    enabled: !!user?.email,
    refetchInterval: 30000,
  });

  const currentUser = freshUser || user;

  // Check current officer's own certifications (60 days threshold)
  useEffect(() => {
    if (!currentUser || !currentUser.email) return;

    const today = new Date();

    // Compute DCJS expiration from officer_certifications (live data, not stale stored field)
    const certs = Array.isArray(currentUser.officer_certifications) ? currentUser.officer_certifications : [];
    const dcjsCore = certs.find(c => c.course_id?.startsWith("01") && c.expiration_date);
    let dcjsExpiration = dcjsCore?.expiration_date || "";
    if (!dcjsExpiration) {
      const dcjsCerts = certs.filter(c => c.category === "dcjs" && c.expiration_date);
      if (dcjsCerts.length > 0) {
        dcjsExpiration = [...dcjsCerts].sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date))[0].expiration_date;
      }
    }
    dcjsExpiration = dcjsExpiration || currentUser.dcjs_expiration;

    // Compute firearm expiration from officer_certifications
    const firearmCerts = certs.filter(c =>
      FIREARM_PREFIXES.some(p => c.course_id?.startsWith(p)) && c.expiration_date
    );
    let firearmExpiration = '';
    if (firearmCerts.length > 0) {
      firearmExpiration = [...firearmCerts].sort((a, b) => new Date(b.expiration_date) - new Date(a.expiration_date))[0].expiration_date;
    }
    firearmExpiration = firearmExpiration || currentUser.firearm_expiration;

    // Dedupe key so we don't spam the same toast every 30s poll
    const notifKey = `dcjs:${dcjsExpiration}|firearm:${firearmExpiration}`;
    if (lastNotifiedRef.current === notifKey) return;
    lastNotifiedRef.current = notifKey;

    // Only show toast if something is actually expiring or expired
    let shouldNotify = false;

    // Check DCJS expiration
    if (dcjsExpiration) {
      try {
        const dcjsDate = new Date(dcjsExpiration);
        const daysUntil = differenceInDays(dcjsDate, today);

        if (daysUntil <= 60 && daysUntil >= 0) {
          shouldNotify = true;
          toast({
            title: "⚠️ DCJS Certification Expiring Soon",
            description: `Your DCJS certification expires in ${daysUntil} days. Please contact the office to renew immediately.`,
            variant: "destructive",
            duration: 20000,
            action: (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.location.href = createPageUrl("OfficerProfile")}
                className="hover:bg-red-100 text-white"
              >
                Profile
              </Button>
            ),
          });
        } else if (daysUntil < 0) {
          shouldNotify = true;
          toast({
            title: "🚨 DCJS Certification EXPIRED",
            description: `Your DCJS certification expired ${Math.abs(daysUntil)} days ago. Contact the office immediately - you cannot work without valid certification.`,
            variant: "destructive",
            duration: 30000,
            action: (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.location.href = createPageUrl("OfficerProfile")}
                className="hover:bg-red-100 text-white"
              >
                Profile
              </Button>
            ),
          });
        }
      } catch (e) {
        console.error('Error checking DCJS expiration:', e);
      }
    }

    // Check Firearm expiration
    if (firearmExpiration) {
      try {
        const faDate = new Date(firearmExpiration);
        const daysUntil = differenceInDays(faDate, today);

        if (daysUntil <= 60 && daysUntil >= 0) {
          shouldNotify = true;
          toast({
            title: "⚠️ Firearm Qualification Expiring Soon",
            description: `Your firearm qualification expires in ${daysUntil} days. Please contact the office to requalify immediately.`,
            variant: "destructive",
            duration: 20000,
            action: (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.location.href = createPageUrl("OfficerProfile")}
                className="hover:bg-red-100 text-white"
              >
                Profile
              </Button>
            ),
          });
        } else if (daysUntil < 0) {
          shouldNotify = true;
          toast({
            title: "🚨 Firearm Qualification EXPIRED",
            description: `Your firearm qualification expired ${Math.abs(daysUntil)} days ago. Contact the office immediately - you cannot carry a firearm without valid qualification.`,
            variant: "destructive",
            duration: 30000,
            action: (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.location.href = createPageUrl("OfficerProfile")}
                className="hover:bg-red-100 text-white"
              >
                Profile
              </Button>
            ),
          });
        }
      } catch (e) {
        console.error('Error checking firearm expiration:', e);
      }
    }

    // Invalidate the main currentUser query so OfficerProfile and other components pick up fresh data too
    if (freshUser) {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    }

  }, [currentUser, toast, freshUser, queryClient]);

  return null;
}