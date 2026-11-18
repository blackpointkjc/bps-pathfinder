import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PenTool, RotateCcw, Check, X } from "lucide-react";
import { toast } from "sonner";

export default function SignaturePad({ onSignatureComplete, onClose, officerName }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // High-DPI canvas sized from the actual rendered pad. Keep drawing coordinates
    // in CSS pixels so mouse, touch, and pen input line up on phones/tablets/desktops.
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1e40af';
    
    // Add white background using CSS-pixel coordinates after the DPR transform.
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    const point = e.touches?.[0] || e.changedTouches?.[0] || e;
    const x = point.clientX - rect.left;
    const y = point.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSignature(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    const point = e.touches?.[0] || e.changedTouches?.[0] || e;
    const x = point.clientX - rect.left;
    const y = point.clientY - rect.top;
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.beginPath();
    setHasSignature(false);
  };

  const saveSignature = async () => {
    if (!hasSignature || uploading) {
      if (!hasSignature) toast.error("Please sign before saving.");
      return;
    }

    const withTimeout = (promise, milliseconds, message) => Promise.race([
      promise,
      new Promise((_, reject) => window.setTimeout(() => reject(new Error(message)), milliseconds)),
    ]);

    setUploading(true);
    try {
      const canvas = canvasRef.current;
      // Signatures are small PNG data URLs stored directly on the report record.
      // This removes the UploadFile integration-credit dependency and makes captured
      // signatures immediately available to every report print view.
      const signatureDataUrl = canvas.toDataURL('image/png');
      if (!signatureDataUrl?.startsWith('data:image/png')) throw new Error('Unable to prepare signature image.');
      await withTimeout(
        Promise.resolve(onSignatureComplete(signatureDataUrl)),
        30000,
        'The signed review took too long to submit. Please try again.'
      );
    } catch (error) {
      console.error("Error saving signature:", error);
      toast.error(error?.message || "Failed to save signature. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="w-full max-w-full overflow-hidden border-2 border-blue-500">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardTitle className="flex items-center gap-2">
          <PenTool className="w-5 h-5 text-blue-600" />
          Sign Report - {officerName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-3 sm:p-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-900 font-medium text-center">
            Use your finger to sign on the pad below
          </p>
        </div>
        
        <div className="border-4 border-blue-600 rounded-lg overflow-hidden bg-white">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="h-44 w-full touch-none cursor-crosshair sm:h-64"
            style={{ touchAction: 'none' }}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
          <Button
            type="button"
            onClick={clearSignature}
            variant="outline"
            className="border-amber-300 text-amber-700 hover:bg-amber-50"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Clear
          </Button>
          <Button
            type="button"
            onClick={onClose}
            variant="outline"
            className="border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button
            type="button"
            onClick={saveSignature}
            disabled={!hasSignature || uploading}
            className="bg-green-600 hover:bg-green-700"
          >
            {uploading ? (
              "Saving..."
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Save
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}