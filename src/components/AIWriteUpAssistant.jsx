import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AIWriteUpAssistant({ description, onSuggest }) {
  const [loading, setLoading] = useState(false);

  const generateSuggestions = async () => {
    if (!description || description.length < 20) {
      alert('Please provide a detailed description first (at least 20 characters)');
      return;
    }

    setLoading(true);
    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an HR assistant for a security company. Based on this incident description, suggest:
1. The most appropriate violation type
2. Severity level
3. Specific corrective actions

Incident Description: ${description}

Provide concise, professional suggestions.`,
        response_json_schema: {
          type: "object",
          properties: {
            violation_type: {
              type: "string",
              enum: ["policy_violation", "tardiness", "uniform_violation", "insubordination", "performance_issue", "conduct_violation", "other"]
            },
            severity: {
              type: "string",
              enum: ["verbal_warning", "written_warning", "final_warning", "suspension_recommended", "termination_recommended"]
            },
            corrective_action: { type: "string" },
            reasoning: { type: "string" }
          }
        }
      });

      onSuggest(response);
    } catch (error) {
      console.error('AI suggestion error:', error);
      alert('Failed to generate suggestions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={generateSuggestions}
      disabled={loading || !description || description.length < 20}
      className="bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-300 hover:from-purple-100 hover:to-indigo-100"
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Analyzing...
        </>
      ) : (
        <>
          <Sparkles className="w-4 h-4 mr-2" />
          AI Suggestions
        </>
      )}
    </Button>
  );
}