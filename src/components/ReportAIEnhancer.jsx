import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";

export default function ReportAIEnhancer({ text, onEnhanced, fieldName = "report" }) {
  const [enhancing, setEnhancing] = useState(false);

  const enhanceMutation = useMutation({
    mutationFn: async (originalText) => {
      setEnhancing(true);
      try {
        const response = await base44.integrations.Core.InvokeLLM({
          prompt: `You are a professional security report writer. Rewrite the following ${fieldName} to be more professional, clear, and detailed while maintaining all factual information.

CRITICAL RULES:
- Do NOT add asterisks, bold formatting, or any markdown
- Do NOT add placeholder text like "[Insert Date]", "[Insert Name]", "Date:", "Reported By:", "Shift Duration:", or "End of Report"
- Do NOT add any header or footer text
- Do NOT add any information that wasn't in the original text
- Write in plain text, using proper grammar and sentence structure
- Use bullet points with • (bullet character) if listing items, NOT asterisks or dashes
- Keep the tone professional and factual
- Return ONLY the enhanced report content, nothing else

Original text:
${originalText}

Enhanced version (plain text only):`,
          add_context_from_internet: false,
        });
        return response;
      } finally {
        setEnhancing(false);
      }
    },
    onSuccess: (enhancedText) => {
      // Clean up any remaining formatting issues
      let cleaned = enhancedText
        .replace(/\*\*/g, '') // Remove bold asterisks
        .replace(/^\*\s/gm, '• ') // Convert asterisk bullets to bullet points
        .replace(/\[Insert.*?\]/gi, '') // Remove placeholder text
        .replace(/\*\*Date:\*\*.*?\n/gi, '')
        .replace(/\*\*Reported By:\*\*.*?\n/gi, '')
        .replace(/\*\*Shift Duration:\*\*.*?\n/gi, '')
        .replace(/End of Report\.?/gi, '')
        .trim();
      
      onEnhanced(cleaned);
    },
    onError: () => {
      alert('Failed to enhance text. Please try again.');
      setEnhancing(false);
    }
  });

  const handleEnhance = () => {
    if (text && text.trim().length > 10) {
      enhanceMutation.mutate(text);
    } else {
      alert('Please write some content first before enhancing.');
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