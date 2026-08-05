import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import TrainingQuiz from "./TrainingQuiz";
import SlideshowViewer from "./SlideshowViewer";
import DocumentViewer from "./DocumentViewer";
import {
  CheckCircle, FileText, Video, HelpCircle, Award,
  ChevronRight, AlertCircle, Clock, Save
} from "lucide-react";

function StepTracker({ steps, currentStep, completedSteps }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((step, idx) => {
        const isCompleted = completedSteps.includes(step.id);
        const isCurrent = currentStep === step.id;
        const Icon = step.icon;
        return (
          <React.Fragment key={step.id}>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all ${
              isCompleted ? "bg-green-100 text-green-700 border border-green-300"
                : isCurrent ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-400 border border-slate-200"
            }`}>
              {isCompleted ? <CheckCircle className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
              {step.label}
            </div>
            {idx < steps.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function CountdownTimer({ secondsLeft, totalSeconds }) {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const pct = totalSeconds > 0 ? Math.round(((totalSeconds - secondsLeft) / totalSeconds) * 100) : 100;
  const isDone = secondsLeft <= 0;
  const isUrgent = secondsLeft <= 60 && secondsLeft > 0;

  return (
    <div className={`rounded-xl p-4 border flex items-center gap-4 ${
      isDone ? "bg-green-50 border-green-300" : isUrgent ? "bg-orange-50 border-orange-300" : "bg-blue-50 border-blue-200"
    }`}>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
        isDone ? "bg-green-500" : isUrgent ? "bg-orange-500" : "bg-blue-500"
      }`}>
        <Clock className="w-6 h-6 text-white" />
      </div>
      <div className="flex-1">
        <p className={`text-xs font-semibold uppercase mb-1 ${isDone ? "text-green-700" : isUrgent ? "text-orange-700" : "text-blue-700"}`}>
          {isDone ? "Training Time Complete — You may now submit" : "Required Training Time"}
        </p>
        {!isDone && (
          <>
            <p className={`text-2xl font-bold font-mono ${isUrgent ? "text-orange-800" : "text-blue-900"}`}>
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </p>
            <div className="mt-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? "bg-orange-500" : "bg-blue-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">You must spend this time reviewing before submitting.</p>
          </>
        )}
      </div>
    </div>
  );
}

const STORAGE_KEY = (moduleId) => `training_progress_${moduleId}`;

function loadProgress(moduleId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(moduleId));
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveProgress(moduleId, data) {
  try {
    localStorage.setItem(STORAGE_KEY(moduleId), JSON.stringify(data));
  } catch {}
}

function clearProgress(moduleId) {
  try {
    localStorage.removeItem(STORAGE_KEY(moduleId));
  } catch {}
}

export default function TrainingModuleViewer({ module, onComplete, isPending }) {
  const totalSeconds = (module.duration_minutes || 0) * 60;

  // Restore saved progress or start fresh
  const savedProgress = loadProgress(module.id);

  const [currentStep, setCurrentStep] = useState(savedProgress?.currentStep || null);
  const [completedSteps, setCompletedSteps] = useState(savedProgress?.completedSteps || []);
  const [completionNotes, setCompletionNotes] = useState(savedProgress?.completionNotes || "");
  const [secondsLeft, setSecondsLeft] = useState(
    savedProgress?.secondsLeft !== undefined ? savedProgress.secondsLeft : totalSeconds
  );
  const [saveIndicator, setSaveIndicator] = useState(false);
  const timerRef = useRef(null);
  const secondsRef = useRef(secondsLeft);
  secondsRef.current = secondsLeft;

  // Normalize: support both material_types[] (new) and material_type string (legacy)
  const types = module.material_types?.length > 0
    ? module.material_types
    : [module.material_type || "document"];

  const hasPdf = types.includes("document") && !!module.document_url;
  const hasVideos = types.includes("video") && (module.video_urls?.filter(Boolean).length > 0 || module.slideshow_urls?.filter(Boolean).length > 0);
  const hasQuiz = types.includes("quiz") && module.quiz_questions?.length > 0;
  const isSlideshow = types.includes("slideshow") && module.slideshow_urls?.length > 0;

  const steps = [
    hasPdf && { id: "pdf", label: "Document", icon: FileText },
    (hasVideos || isSlideshow) && { id: "videos", label: "Videos", icon: Video },
    hasQuiz && { id: "quiz", label: "Quiz", icon: HelpCircle },
    { id: "complete", label: "Complete", icon: Award },
  ].filter(Boolean);

  const firstStep = steps[0]?.id || "complete";

  // Initialize step only if no saved progress
  useEffect(() => {
    if (!savedProgress) {
      setCurrentStep(firstStep);
      setCompletedSteps([]);
      setSecondsLeft(totalSeconds);
    }
  }, [module.id]);

  // Countdown timer — only runs if totalSeconds > 0 and time remaining
  useEffect(() => {
    if (totalSeconds <= 0) return;
    if (secondsLeft <= 0) return;

    timerRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(timerRef.current);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [module.id]);

  // Auto-save progress every 10 seconds
  useEffect(() => {
    if (!currentStep) return;
    const interval = setInterval(() => {
      saveProgress(module.id, {
        currentStep,
        completedSteps,
        completionNotes,
        secondsLeft: secondsRef.current,
        savedAt: new Date().toISOString(),
      });
      setSaveIndicator(true);
      setTimeout(() => setSaveIndicator(false), 2000);
    }, 10000);
    return () => clearInterval(interval);
  }, [currentStep, completedSteps, completionNotes, module.id]);

  // Also save whenever step changes
  useEffect(() => {
    if (!currentStep) return;
    saveProgress(module.id, {
      currentStep,
      completedSteps,
      completionNotes,
      secondsLeft: secondsRef.current,
      savedAt: new Date().toISOString(),
    });
  }, [currentStep, completedSteps]);

  const timerExpired = totalSeconds <= 0 || secondsLeft <= 0;

  const markDone = (stepId) =>
    setCompletedSteps(prev => prev.includes(stepId) ? prev : [...prev, stepId]);

  const advanceFrom = (stepId) => {
    markDone(stepId);
    const idx = steps.findIndex(s => s.id === stepId);
    const next = steps[idx + 1];
    if (next) setCurrentStep(next.id);
  };

  const handleComplete = (extraArgs = {}) => {
    clearProgress(module.id);
    onComplete({ notes: completionNotes, ...extraArgs });
  };

  const isDocumentOnly = hasPdf && !hasVideos && !isSlideshow && !hasQuiz;

  return (
    <div className="space-y-4">
      {/* Save indicator */}
      {saveIndicator && (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
          <Save className="w-3.5 h-3.5" /> Progress saved — you can return later and continue where you left off.
        </div>
      )}

      {/* Countdown timer */}
      {totalSeconds > 0 && (
        <CountdownTimer secondsLeft={secondsLeft} totalSeconds={totalSeconds} />
      )}

      {/* Resumed from save notice */}
      {savedProgress && (
        <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
          <Clock className="w-3.5 h-3.5" />
          Progress restored — continuing from where you left off.
        </div>
      )}

      {/* Step tracker */}
      {steps.length > 2 && (
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Training Progress</p>
          <StepTracker steps={steps} currentStep={currentStep} completedSteps={completedSteps} />
          <div className="flex gap-2 mt-3 flex-wrap">
            {hasPdf && (
              <button onClick={() => setCurrentStep("pdf")}
                className={`text-xs px-2 py-1 rounded border transition-colors ${currentStep === "pdf" ? "bg-blue-50 border-blue-400 text-blue-700 font-semibold" : "border-slate-200 text-slate-500 hover:bg-slate-100"}`}>
                📄 Document
              </button>
            )}
            {(hasVideos || isSlideshow) && (
              <button onClick={() => setCurrentStep("videos")}
                className={`text-xs px-2 py-1 rounded border transition-colors ${currentStep === "videos" ? "bg-blue-50 border-blue-400 text-blue-700 font-semibold" : "border-slate-200 text-slate-500 hover:bg-slate-100"}`}>
                🎬 Videos
              </button>
            )}
            {hasQuiz && (
              <button onClick={() => setCurrentStep("quiz")}
                className={`text-xs px-2 py-1 rounded border transition-colors ${currentStep === "quiz" ? "bg-blue-50 border-blue-400 text-blue-700 font-semibold" : "border-slate-200 text-slate-500 hover:bg-slate-100"}`}>
                📝 Quiz
              </button>
            )}
          </div>
        </div>
      )}

      {/* PDF step */}
      {currentStep === "pdf" && hasPdf && (
        <div className="space-y-4">
          <DocumentViewer
            documentUrl={module.document_url}
            onComplete={() => {
              if (hasVideos || isSlideshow || hasQuiz) {
                advanceFrom("pdf");
              } else if (timerExpired) {
                handleComplete();
              }
            }}
          />
          {/* Show a locked message if doc-only and timer hasn't expired yet */}
          {!hasVideos && !isSlideshow && !hasQuiz && !timerExpired && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              The completion button will unlock once the required training timer finishes.
            </div>
          )}
        </div>
      )}

      {/* Videos / Slideshow step */}
      {currentStep === "videos" && (hasVideos || isSlideshow) && (
        <div className="space-y-4">
          {isSlideshow && module.slideshow_urls?.length > 0 && (
            <SlideshowViewer
              slides={module.slideshow_urls}
              secondsPerSlide={module.seconds_per_slide || 30}
              onComplete={() => {
                if (!hasQuiz) handleComplete();
                else advanceFrom("videos");
              }}
            />
          )}
          {module.video_urls?.filter(Boolean).length > 0 && (
            <>
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-900 flex items-center gap-2">
                <Video className="w-4 h-4 flex-shrink-0" />
                <span><strong>Training Videos</strong> — Watch all videos, then click Continue.</span>
              </div>
              {module.video_urls.filter(Boolean).map((videoUrl, idx) => {
                const isYouTube = videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be");
                let embedUrl = videoUrl;
                if (isYouTube) {
                  let videoId = "";
                  if (videoUrl.includes("watch?v=")) videoId = videoUrl.split("watch?v=")[1]?.split("&")[0];
                  else if (videoUrl.includes("youtu.be/")) videoId = videoUrl.split("youtu.be/")[1]?.split("?")[0];
                  else if (videoUrl.includes("embed/")) videoId = videoUrl.split("embed/")[1]?.split("?")[0];
                  embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
                }
                return (
                  <div key={idx} className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                    <div className="bg-slate-800 px-3 py-2 text-xs text-slate-300 font-medium">
                      Video {idx + 1} of {module.video_urls.filter(Boolean).length}
                    </div>
                    <div className="aspect-video bg-black">
                      {isYouTube ? (
                        <iframe
                          src={embedUrl}
                          className="w-full h-full"
                          allowFullScreen
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          title={`Video ${idx + 1}`}
                          referrerPolicy="strict-origin-when-cross-origin"
                        />
                      ) : (
                        <video src={videoUrl} controls className="w-full h-full" />
                      )}
                    </div>
                  </div>
                );
              })}
              <Textarea placeholder="Optional notes..." value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} rows={2} />
              <Button
                onClick={() => { if (!hasQuiz) handleComplete(); else advanceFrom("videos"); }}
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={!hasQuiz && !timerExpired}
                title={!hasQuiz && !timerExpired ? "Wait for the timer to finish" : ""}
              >
                {hasQuiz ? "Videos Watched — Continue to Quiz →" : timerExpired ? "Mark Training Complete ✓" : "Wait for timer…"}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Quiz step */}
      {currentStep === "quiz" && hasQuiz && (
        <div className="space-y-4">
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-900 flex items-center gap-2">
            <HelpCircle className="w-4 h-4 flex-shrink-0" />
            <span><strong>Knowledge Check</strong> — Passing score: {module.passing_score || 80}%
              {!timerExpired && <span className="ml-2 text-orange-700 font-semibold">⏳ Timer must finish before submitting.</span>}
            </span>
          </div>
          <TrainingQuiz
            questions={module.quiz_questions}
            passingScore={module.passing_score || 80}
            submitDisabled={!timerExpired}
            onComplete={(score) => {
              markDone("quiz");
              handleComplete({ quizScore: score });
            }}
          />
        </div>
      )}

      {/* Quiz-only (no doc, no video) */}
      {currentStep === "complete" && !hasPdf && !hasVideos && !isSlideshow && hasQuiz && (
        <div className="space-y-4">
          {!timerExpired && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              The quiz submit button will unlock once the required training time is complete.
            </div>
          )}
          <TrainingQuiz
            questions={module.quiz_questions}
            passingScore={module.passing_score || 80}
            submitDisabled={!timerExpired}
            onComplete={(score) => handleComplete({ quizScore: score })}
          />
        </div>
      )}

      {/* Final complete step */}
      {currentStep === "complete" && (!hasQuiz || completedSteps.includes("quiz")) && !(!hasPdf && !hasVideos && !isSlideshow && hasQuiz) && (
        <div className="space-y-4">
          <div className="p-6 bg-green-50 border border-green-200 rounded-xl text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-green-900 mb-1">All Sections Complete!</h3>
            <p className="text-sm text-green-700">You've reviewed all training materials. Click below to record your completion.</p>
          </div>
          <Textarea placeholder="Add notes (optional)..." value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} rows={2} />
          <Button
            onClick={() => handleComplete()}
            disabled={!timerExpired || isPending}
            className="w-full bg-green-600 hover:bg-green-700 py-3 text-base"
            title={!timerExpired ? "Wait for the timer to finish before completing" : ""}
          >
            <CheckCircle className="w-5 h-5 mr-2" />
            {isPending ? "Recording..." : timerExpired ? "Mark Training as Complete" : "Wait for timer…"}
          </Button>
        </div>
      )}
    </div>
  );
}