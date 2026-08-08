import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";

export default function TrainingQuiz({ questions, passingScore, onComplete, submitDisabled = false }) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);

  const handleAnswer = (questionIndex, answer) => {
    setAnswers({ ...answers, [questionIndex]: answer });
  };

  const handleSubmit = () => {
    if (!questions || questions.length === 0) return;

    let correct = 0;
    questions.forEach((q, idx) => {
      if (answers[idx] === q.correct_answer) {
        correct++;
      }
    });

    const finalScore = Math.round((correct / questions.length) * 100);
    setScore(finalScore);
    setShowResults(true);

    if (finalScore >= passingScore) {
      setTimeout(() => {
        onComplete(finalScore);
      }, 2000);
    }
  };

  const allAnswered = questions?.length > 0 && questions.every((_, idx) => answers[idx] !== undefined);

  if (!questions || questions.length === 0) {
    return (
      <Card className="border-red-200">
        <CardContent className="p-6 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-red-500" />
          <p className="text-slate-600">Quiz questions not configured</p>
        </CardContent>
      </Card>
    );
  }

  if (showResults) {
    const passed = score >= passingScore;
    return (
      <Card className={`border-2 ${passed ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
        <CardContent className="p-8 text-center">
          {passed ? (
            <>
              <CheckCircle className="w-20 h-20 mx-auto mb-4 text-green-600" />
              <h3 className="text-2xl font-bold text-green-900 mb-2">Congratulations!</h3>
              <p className="text-lg text-green-700 mb-4">You passed the quiz!</p>
              <div className="bg-white rounded-lg p-4 inline-block">
                <p className="text-4xl font-bold text-green-600">{score}%</p>
                <p className="text-sm text-slate-600">Your Score</p>
              </div>
              <p className="text-sm text-green-600 mt-4">Training will be marked complete...</p>
            </>
          ) : (
            <>
              <XCircle className="w-20 h-20 mx-auto mb-4 text-red-600" />
              <h3 className="text-2xl font-bold text-red-900 mb-2">Not Quite There</h3>
              <p className="text-lg text-red-700 mb-4">You need {passingScore}% to pass</p>
              <div className="bg-white rounded-lg p-4 inline-block">
                <p className="text-4xl font-bold text-red-600">{score}%</p>
                <p className="text-sm text-slate-600">Your Score</p>
              </div>
              <p className="text-sm text-red-600 mt-4">Please review the material and try again</p>
              <Button 
                onClick={() => {
                  setShowResults(false);
                  setAnswers({});
                  setCurrentQuestion(0);
                }}
                className="mt-6 bg-red-600 hover:bg-red-700"
              >
                Retry Quiz
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-blue-900">Training Quiz</CardTitle>
            <Badge className="bg-blue-600">
              {Object.keys(answers).length}/{questions.length} Answered
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-blue-800">
            Answer all questions correctly to complete this training. Passing score: {passingScore}%
          </p>
          <p className="text-xs text-blue-600 mt-2">
            ⚠️ Copy/paste is disabled for quiz integrity
          </p>
        </CardContent>
      </Card>

      <div className="space-y-4" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
        {questions.map((question, idx) => (
          <Card key={idx} className={`${answers[idx] !== undefined ? 'border-green-200' : 'border-slate-200'}`}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">
                  {idx + 1}
                </span>
                {question.question}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup value={answers[idx]} onValueChange={(value) => handleAnswer(idx, value)}>
                {question.options?.map((option, optIdx) => (
                  <div key={optIdx} className="flex items-center space-x-2 p-3 rounded-lg hover:bg-slate-50">
                    <RadioGroupItem value={option} id={`q${idx}-opt${optIdx}`} />
                    <Label htmlFor={`q${idx}-opt${optIdx}`} className="flex-1 cursor-pointer">
                      {option}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end flex-col items-end gap-2">
        {submitDisabled && (
          <p className="text-xs text-orange-600 font-semibold">⏳ The timer must finish before you can submit the quiz.</p>
        )}
        <Button
          onClick={handleSubmit}
          disabled={!allAnswered || submitDisabled}
          className="bg-green-600 hover:bg-green-700"
          size="lg"
          title={submitDisabled ? "Wait for the required training time to complete" : ""}
        >
          Submit Quiz
        </Button>
      </div>
    </div>
  );
}