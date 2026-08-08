import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { FileText, Download, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DocumentViewer({ documentUrl, onComplete, requiredMinutes = 0 }) {
  const [timeSpent, setTimeSpent] = useState(0);
  const [canComplete, setCanComplete] = useState(requiredMinutes === 0);
  
  const isPDF = documentUrl?.toLowerCase().endsWith('.pdf');
  const isDocx = documentUrl?.toLowerCase().endsWith('.docx') || documentUrl?.toLowerCase().endsWith('.doc');
  const isPPT = documentUrl?.toLowerCase().endsWith('.ppt') || documentUrl?.toLowerCase().endsWith('.pptx');

  useEffect(() => {
    if (requiredMinutes === 0) {
      setCanComplete(true);
      return;
    }

    const interval = setInterval(() => {
      setTimeSpent(prev => {
        const newTime = prev + 1;
        if (newTime >= requiredMinutes * 60) {
          setCanComplete(true);
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [requiredMinutes]);

  const handleComplete = () => {
    if (canComplete && onComplete) {
      onComplete();
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Direct embed for PDFs, use viewers for other formats
  const getViewerUrl = () => {
    if (isPDF) {
      // Direct PDF embed works best - no third-party viewer needed
      return `${documentUrl}#view=FitH&toolbar=0`;
    }
    if (isPPT) {
      // Microsoft Office Online viewer works best for PowerPoint
      return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(documentUrl)}`;
    }
    // Google Docs Viewer for Word documents
    return `https://docs.google.com/viewer?url=${encodeURIComponent(documentUrl)}&embedded=true`;
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-2 border-slate-200">
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-slate-900">
              {isPPT ? 'Training Slideshow' : 'Training Document'}
            </span>
          </div>
          <a href={documentUrl} download target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </a>
        </div>
        
        <div className="relative bg-white" style={{ height: '70vh' }}>
          {isPDF ? (
            <embed
              src={getViewerUrl()}
              type="application/pdf"
              className="w-full h-full"
              style={{ minHeight: '600px' }}
            />
          ) : (
            <iframe
              src={getViewerUrl()}
              className="w-full h-full border-0 bg-white"
              title="Training Document"
              style={{ minHeight: '600px', backgroundColor: 'white' }}
              allow="fullscreen"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
          )}
        </div>
        {isPPT && (
          <div className="p-3 bg-blue-50 border-t border-blue-200">
            <p className="text-xs text-blue-900">
              💡 <strong>Tip:</strong> Use the navigation arrows in the viewer to go through all slides. 
              For better performance, admins can export PowerPoint as individual images and upload as a slideshow.
            </p>
          </div>
        )}
      </Card>

      {canComplete ? (
        <div className="flex justify-center">
          <Button
            onClick={handleComplete}
            className="bg-green-600 hover:bg-green-700 px-8 py-6 text-lg"
            size="lg"
          >
            I've Reviewed This Document
          </Button>
        </div>
      ) : (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center justify-center gap-2 text-amber-900">
            <Clock className="w-5 h-5" />
            <span className="font-semibold">
              Continue reviewing document for {formatTime((requiredMinutes * 60) - timeSpent)} more to complete
            </span>
          </div>
        </div>
      )}

      {requiredMinutes > 0 && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-blue-900">
                <strong>Time Spent:</strong> {formatTime(timeSpent)} / {requiredMinutes} min required
              </span>
            </div>
            {!canComplete && (
              <span className="text-xs text-blue-700 font-medium">
                {Math.ceil(((requiredMinutes * 60) - timeSpent) / 60)} min remaining
              </span>
            )}
          </div>
        </div>
      )}

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          📖 <strong>Note:</strong> Please review the entire document before marking as complete. 
          You can download it for offline reference using the button above.
        </p>
      </div>
    </div>
  );
}