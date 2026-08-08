import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, CheckCircle, Lock, Eye } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function SlideshowViewer({ slides, secondsPerSlide, onComplete }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideProgress, setSlideProgress] = useState(0);
  const [viewedSlides, setViewedSlides] = useState(new Set([0]));
  const [canAdvance, setCanAdvance] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  // Disable text selection and copying
  useEffect(() => {
    const handleCopy = (e) => e.preventDefault();
    const handleContextMenu = (e) => e.preventDefault();
    
    document.addEventListener('copy', handleCopy);
    document.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  // Timer for current slide
  useEffect(() => {
    setCanAdvance(false);
    setSlideProgress(0);
    
    const interval = setInterval(() => {
      setSlideProgress(prev => {
        const newProgress = prev + (100 / secondsPerSlide);
        if (newProgress >= 100) {
          setCanAdvance(true);
          return 100;
        }
        return newProgress;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentSlide, secondsPerSlide]);

  const handleNext = () => {
    if (!canAdvance) return;
    
    if (currentSlide < slides.length - 1) {
      const nextSlide = currentSlide + 1;
      setCurrentSlide(nextSlide);
      setViewedSlides(prev => new Set([...prev, nextSlide]));
    } else if (viewedSlides.size === slides.length && canAdvance) {
      setIsCompleted(true);
    }
  };

  const handlePrevious = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleFinish = () => {
    if (viewedSlides.size === slides.length && isCompleted) {
      onComplete();
    }
  };

  const allSlidesViewed = viewedSlides.size === slides.length;
  const progressPercentage = (viewedSlides.size / slides.length) * 100;

  return (
    <div className="space-y-4" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-700">
            Slide {currentSlide + 1} of {slides.length}
          </span>
          <span className="text-sm text-slate-600">
            {allSlidesViewed ? (
              <span className="text-green-600 font-semibold flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                All slides viewed
              </span>
            ) : (
              `${viewedSlides.size}/${slides.length} viewed`
            )}
          </span>
        </div>
        <Progress value={progressPercentage} className="h-2" />
      </div>

      <Card className="relative overflow-hidden" style={{ userSelect: 'none' }}>
        {/* Anti-screenshot overlay - makes it harder to screenshot */}
        <div className="absolute inset-0 pointer-events-none z-10" style={{ 
          background: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.03) 10px, rgba(255,255,255,0.03) 20px)',
        }} />
        
        <img
          src={slides[currentSlide]}
          alt={`Training Slide ${currentSlide + 1}`}
          className="w-full h-auto select-none"
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        />
        
        {!canAdvance && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-amber-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-pulse">
            <Lock className="w-4 h-4" />
            <span className="font-semibold">
              Please view for {Math.ceil((100 - slideProgress) * secondsPerSlide / 100)}s
            </span>
          </div>
        )}

        <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-1 rounded-full text-sm flex items-center gap-2">
          <Eye className="w-4 h-4" />
          {viewedSlides.has(currentSlide) ? 'Viewed' : 'Viewing'}
        </div>
      </Card>

      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
        <Progress value={slideProgress} className="h-2 mb-2" />
        <p className="text-xs text-slate-600 text-center">
          {canAdvance ? (
            <span className="text-green-600 font-semibold">✓ You can now navigate</span>
          ) : (
            `Minimum viewing time: ${Math.ceil((100 - slideProgress) * secondsPerSlide / 100)} seconds remaining`
          )}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={currentSlide === 0}
          className="flex-1"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Previous
        </Button>

        {currentSlide < slides.length - 1 ? (
          <Button
            onClick={handleNext}
            disabled={!canAdvance}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleFinish}
            disabled={!allSlidesViewed || !canAdvance}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Complete Training
          </Button>
        )}
      </div>

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-xs text-amber-800">
          <strong>⚠️ Training Guidelines:</strong> You must view each slide for the minimum required time. 
          Copy/paste and screenshots are disabled. This ensures proper training comprehension.
        </p>
      </div>
    </div>
  );
}