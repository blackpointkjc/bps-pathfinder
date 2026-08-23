import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ReportAIEnhancer({ text, onEnhanced, fieldName = "report" }) {
  const [enhancing, setEnhancing] = useState(false);

  const enhanceMutation = useMutation({
    mutationFn: async (originalText) => {
      setEnhancing(true);
      try {
        // Credit-free, deterministic professionalizer. The previous InvokeLLM
        // call drained integration credits and silently failed; this rule-based
        // backend function cleans casing, spacing, and punctuation without an LLM.
        const response = await base44.functions.invoke("professionalizeReport", {
          fields: [{ field: fieldName, text: originalText }],
        });
        const payload = response?.data || response || {};
        if (payload.error) throw new Error(payload.error);
        const first = (payload.fields || [])[0];
        if (!first?.text) throw new Error("Unable to enhance the text right now. Please try again.");
        return String(first.text);
      } finally {
        setEnhancing(false);
      }
    },
    onSuccess: (enhancedText) => {
      onEnhanced(enhancedText.trim());
      toast.success("Text enhanced.");
    },
    onError: (error) => {
      toast.error(error?.message || "Failed to enhance text. Please try again.");
    },
  });

  const handleEnhance = () => {
    if (text && text.trim().length > 10) {
      enhanceMutation.mutate(text);
    } else {
      toast.error("Please write some content first before enhancing.");
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleEnhance}
      disabled={enhancing || !text || text.trim().length < 10}
      className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200 hover:from-purple-100 hover:to-blue-100"
    >
      {enhancing ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Enhancing...
        </>
      ) : (
        <>
          <Sparkles className="w-4 h-4 mr-2 text-purple-600" />
          AI Enhance
        </>
      )}
    </Button>
  );
}