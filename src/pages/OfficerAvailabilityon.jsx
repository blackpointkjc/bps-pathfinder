import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function OfficerAvailabilityon() {
  const navigate = useNavigate();
  
  React.useEffect(() => {
    navigate(createPageUrl("OfficerAvailability"), { replace: true });
  }, [navigate]);
  
  return null;
}