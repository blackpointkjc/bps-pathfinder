import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function TrainingCompliance() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(createPageUrl("OfficerTraining"), { replace: true });
  }, [navigate]);
  return null;
}