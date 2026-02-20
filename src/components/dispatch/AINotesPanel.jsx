import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, Send, BookOpen, Lightbulb, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

export default function AINotesPanel({ call, currentUser, onNoteSaved }) {
    const [noteInput, setNoteInput] = useState('');
    const [aiSummary, setAiSummary] = useState(null);
    const [aiSuggestions, setAiSuggestions] = useState(null);
    const [aiUpdate, setAiUpdate] = useState(null);
    const [loading, setLoading] = useState({ summary: false, suggest: false, generate: false, save: false });
    const [expanded, setExpanded] = useState({ summary: true, suggest: false, generate: false });

    const callContext = `
Call Type: ${call.incident}
Location: ${call.location}
Agency: ${call.agency || 'Unknown'}
Status: ${call.status}
Priority: ${call.priority || 'medium'}
Description: ${call.description || 'None'}
Time Received: ${call.time_received ? new Date(call.time_received).toLocaleString() : 'Unknown'}
    `.trim();

    const handleSummarizeNotes = async () => {
        setLoading(l => ({ ...l, summary: true }));
        try {
            const result = await base44.integrations.Core.InvokeLLM({
                prompt: `You are a professional CAD dispatcher assistant. Analyze the following call information and provide:
1. A brief category label (e.g., "Priority 1 - Violent Crime", "Medical Emergency", "Property Crime")
2. A 2-3 sentence summary of the incident
3. Key facts bullet points

Call Information:
${callContext}
Dispatcher Note: ${noteInput || '(no note entered)'}

Format your response as:
CATEGORY: [category]
SUMMARY: [summary]
KEY FACTS: [bullet points]`,
                response_json_schema: {
                    type: "object",
                    properties: {
                        category: { type: "string" },
                        summary: { type: "string" },
                        key_facts: { type: "array", items: { type: "string" } }
                    }
                }
            });
            setAiSummary(result);
            setExpanded(e => ({ ...e, summary: true }));
        } catch (err) {
            toast.error('AI summarization failed');
        } finally {
            setLoading(l => ({ ...l, summary: false }));
        }
    };

    const handleGetSuggestions = async () => {
        setLoading(l => ({ ...l, suggest: true }));
        try {
            const result = await base44.integrations.Core.InvokeLLM({
                prompt: `You are a law enforcement CAD dispatcher with 20 years experience. Based on this active call, provide 3-5 actionable suggestions for the dispatcher.

${callContext}
Current dispatcher note: ${noteInput || '(none)'}

Provide specific, tactical recommendations. Consider: resource needs, safety concerns, follow-up actions, notifications required, coordination needs.`,
                response_json_schema: {
                    type: "object",
                    properties: {
                        suggestions: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    action: { type: "string" },
                                    priority: { type: "string", enum: ["high", "medium", "low"] },
                                    reason: { type: "string" }
                                }
                            }
                        }
                    }
                }
            });
            setAiSuggestions(result?.suggestions || []);
            setExpanded(e => ({ ...e, suggest: true }));
        } catch (err) {
            toast.error('AI suggestions failed');
        } finally {
            setLoading(l => ({ ...l, suggest: false }));
        }
    };

    const handleGenerateUpdate = async () => {
        if (!noteInput.trim()) {
            toast.error('Enter a note first to generate a log update');
            return;
        }
        setLoading(l => ({ ...l, generate: true }));
        try {
            const result = await base44.integrations.Core.InvokeLLM({
                prompt: `You are a CAD dispatcher. Convert the following informal dispatcher note into a professional, concise call log entry using standard law enforcement radio/CAD language.

Call: ${call.incident} at ${call.location}
Dispatcher Input: "${noteInput}"

Write a single professional log update entry (1-2 sentences). Use clear, concise CAD terminology. Include time notation if relevant. Do not add information not in the original note.`,
            });
            setAiUpdate(result);
            setExpanded(e => ({ ...e, generate: true }));
        } catch (err) {
            toast.error('Log generation failed');
        } finally {
            setLoading(l => ({ ...l, generate: false }));
        }
    };

    const handleSaveNote = async (text) => {
        const noteText = text || noteInput;
        if (!noteText.trim() || !currentUser) return;
        setLoading(l => ({ ...l, save: true }));
        try {
            await base44.entities.CallNote.create({
                call_id: call.id,
                author_id: currentUser.id,
                author_name: currentUser.full_name,
                note: noteText,
                note_type: 'general'
            });
            setNoteInput('');
            setAiUpdate(null);
            toast.success('Note saved');
            onNoteSaved?.();
        } catch (err) {
            toast.error('Failed to save note');
        } finally {
            setLoading(l => ({ ...l, save: false }));
        }
    };

    const priorityColor = { high: 'bg-red-100 text-red-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-green-100 text-green-700' };

    return (
        <div className="space-y-4">
            {/* Note Input */}
            <div className="space-y-2">
                <div className="flex gap-2">
                    <Textarea
                        placeholder="Enter dispatcher notes..."
                        value={noteInput}
                        onChange={e => setNoteInput(e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white font-mono min-h-[80px] resize-none"
                        rows={3}
                    />
                </div>

                {/* AI Action Buttons */}
                <div className="flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        onClick={handleSummarizeNotes}
                        disabled={loading.summary}
                        className="bg-purple-600 hover:bg-purple-700 text-xs font-mono"
                    >
                        {loading.summary ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <BookOpen className="w-3 h-3 mr-1" />}
                        SUMMARIZE
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleGetSuggestions}
                        disabled={loading.suggest}
                        className="bg-amber-600 hover:bg-amber-700 text-xs font-mono"
                    >
                        {loading.suggest ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Lightbulb className="w-3 h-3 mr-1" />}
                        SUGGEST
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleGenerateUpdate}
                        disabled={loading.generate}
                        className="bg-cyan-600 hover:bg-cyan-700 text-xs font-mono"
                    >
                        {loading.generate ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <FileText className="w-3 h-3 mr-1" />}
                        GEN LOG
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => handleSaveNote()}
                        disabled={loading.save || !noteInput.trim()}
                        className="bg-blue-600 hover:bg-blue-700 text-xs font-mono ml-auto"
                    >
                        {loading.save ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
                        SAVE
                    </Button>
                </div>
            </div>

            {/* AI Summary */}
            <AnimatePresence>
                {aiSummary && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-purple-900/40 border border-purple-500/30 rounded-lg overflow-hidden"
                    >
                        <button
                            className="w-full flex items-center justify-between px-3 py-2 text-left"
                            onClick={() => setExpanded(e => ({ ...e, summary: !e.summary }))}
                        >
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-3 h-3 text-purple-400" />
                                <span className="text-purple-300 text-xs font-mono font-bold">AI SUMMARY</span>
                                {aiSummary.category && (
                                    <Badge className="bg-purple-600/50 text-purple-200 text-[10px]">{aiSummary.category}</Badge>
                                )}
                            </div>
                            {expanded.summary ? <ChevronUp className="w-3 h-3 text-purple-400" /> : <ChevronDown className="w-3 h-3 text-purple-400" />}
                        </button>
                        <AnimatePresence>
                            {expanded.summary && (
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: 'auto' }}
                                    exit={{ height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-3 pb-3 space-y-2">
                                        {aiSummary.summary && (
                                            <p className="text-slate-300 text-xs">{aiSummary.summary}</p>
                                        )}
                                        {aiSummary.key_facts?.length > 0 && (
                                            <ul className="space-y-1">
                                                {aiSummary.key_facts.map((fact, i) => (
                                                    <li key={i} className="text-slate-400 text-xs flex items-start gap-1">
                                                        <span className="text-purple-400 mt-0.5">•</span>
                                                        {fact}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* AI Suggestions */}
            <AnimatePresence>
                {aiSuggestions && aiSuggestions.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-amber-900/40 border border-amber-500/30 rounded-lg overflow-hidden"
                    >
                        <button
                            className="w-full flex items-center justify-between px-3 py-2 text-left"
                            onClick={() => setExpanded(e => ({ ...e, suggest: !e.suggest }))}
                        >
                            <div className="flex items-center gap-2">
                                <Lightbulb className="w-3 h-3 text-amber-400" />
                                <span className="text-amber-300 text-xs font-mono font-bold">AI SUGGESTIONS ({aiSuggestions.length})</span>
                            </div>
                            {expanded.suggest ? <ChevronUp className="w-3 h-3 text-amber-400" /> : <ChevronDown className="w-3 h-3 text-amber-400" />}
                        </button>
                        <AnimatePresence>
                            {expanded.suggest && (
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: 'auto' }}
                                    exit={{ height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-3 pb-3 space-y-2">
                                        {aiSuggestions.map((s, i) => (
                                            <div key={i} className="flex items-start gap-2 p-2 bg-amber-900/30 rounded">
                                                <Badge className={`${priorityColor[s.priority] || priorityColor.medium} text-[9px] shrink-0 mt-0.5`}>
                                                    {(s.priority || 'med').toUpperCase()}
                                                </Badge>
                                                <div>
                                                    <p className="text-amber-100 text-xs font-semibold">{s.action}</p>
                                                    {s.reason && <p className="text-slate-400 text-[11px] mt-0.5">{s.reason}</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Generated Log Update */}
            <AnimatePresence>
                {aiUpdate && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-cyan-900/40 border border-cyan-500/30 rounded-lg p-3"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-3 h-3 text-cyan-400" />
                            <span className="text-cyan-300 text-xs font-mono font-bold">GENERATED LOG ENTRY</span>
                        </div>
                        <p className="text-slate-200 text-xs font-mono bg-slate-900/50 p-2 rounded">{aiUpdate}</p>
                        <Button
                            size="sm"
                            onClick={() => handleSaveNote(aiUpdate)}
                            disabled={loading.save}
                            className="mt-2 bg-cyan-600 hover:bg-cyan-700 text-xs w-full"
                        >
                            {loading.save ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
                            SAVE THIS LOG ENTRY
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}