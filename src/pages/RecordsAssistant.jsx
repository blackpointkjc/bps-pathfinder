import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Send, Bot, Loader2, Plus, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function RecordsAssistant() {
    const [conversations, setConversations] = useState([]);
    const [activeConversation, setActiveConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        loadConversations();
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (!activeConversation) return;
        const unsub = base44.agents.subscribeToConversation(activeConversation.id, (data) => {
            setMessages(data.messages || []);
        });
        return unsub;
    }, [activeConversation?.id]);

    const loadConversations = async () => {
        setLoading(true);
        try {
            const convs = await base44.agents.listConversations({ agent_name: 'records_assistant' });
            setConversations(convs || []);
        } finally {
            setLoading(false);
        }
    };

    const startNewConversation = async () => {
        const conv = await base44.agents.createConversation({
            agent_name: 'records_assistant',
            metadata: { name: `Records Session ${new Date().toLocaleTimeString()}` }
        });
        setConversations(prev => [conv, ...prev]);
        setActiveConversation(conv);
        setMessages([]);
    };

    const openConversation = async (conv) => {
        const full = await base44.agents.getConversation(conv.id);
        setActiveConversation(full);
        setMessages(full.messages || []);
    };

    const sendMessage = async () => {
        if (!input.trim() || !activeConversation || sending) return;
        const text = input.trim();
        setInput('');
        setSending(true);
        try {
            await base44.agents.addMessage(activeConversation, { role: 'user', content: text });
        } finally {
            setSending(false);
        }
    };

    const handleKey = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex">
            {/* Sidebar */}
            <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
                <div className="p-4 border-b border-slate-800">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                            <Bot className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <p className="text-white font-mono font-bold text-sm">RECORDS AI</p>
                            <p className="text-slate-500 text-xs font-mono">Assistant</p>
                        </div>
                    </div>
                    <Button onClick={startNewConversation} className="w-full bg-purple-600 hover:bg-purple-700 font-mono text-xs">
                        <Plus className="w-4 h-4 mr-1" /> NEW SESSION
                    </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {loading ? (
                        <div className="flex justify-center mt-4"><Loader2 className="w-4 h-4 animate-spin text-slate-500" /></div>
                    ) : conversations.length === 0 ? (
                        <p className="text-slate-600 font-mono text-xs text-center mt-4">No sessions yet</p>
                    ) : conversations.map(conv => (
                        <button
                            key={conv.id}
                            onClick={() => openConversation(conv)}
                            className={`w-full text-left px-3 py-2 rounded-lg transition-colors font-mono text-xs ${
                                activeConversation?.id === conv.id
                                    ? 'bg-purple-600/30 border border-purple-500/50 text-white'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <MessageSquare className="w-3 h-3 shrink-0" />
                                <span className="truncate">{conv.metadata?.name || 'Session'}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col">
                {!activeConversation ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
                        <div className="w-16 h-16 bg-purple-600/20 border border-purple-500/30 rounded-full flex items-center justify-center">
                            <Bot className="w-8 h-8 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-white font-mono font-bold text-xl mb-2">RECORDS ASSISTANT</h2>
                            <p className="text-slate-400 font-mono text-sm max-w-md">
                                Search, create, and update Incident Reports and Trespassing Notices with call linkage and approval workflow.
                            </p>
                        </div>
                        <Button onClick={startNewConversation} className="bg-purple-600 hover:bg-purple-700 font-mono">
                            <Plus className="w-4 h-4 mr-2" /> START NEW SESSION
                        </Button>
                        <div className="grid grid-cols-2 gap-3 mt-4 max-w-lg w-full">
                            {[
                                'Search incident reports for John Smith',
                                'Create a trespassing notice for 123 Main St',
                                'Look up vehicle license plate ABC123',
                                'Link this report to call #2024-001'
                            ].map(hint => (
                                <button key={hint} onClick={async () => {
                                    const conv = await base44.agents.createConversation({ agent_name: 'records_assistant', metadata: { name: `Records Session ${new Date().toLocaleTimeString()}` } });
                                    setConversations(prev => [conv, ...prev]);
                                    setActiveConversation(conv);
                                    setMessages([]);
                                    setInput(hint);
                                }} className="text-left px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-400 font-mono text-xs transition-colors">
                                    {hint}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="h-12 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-2">
                            <Bot className="w-4 h-4 text-purple-400" />
                            <span className="text-white font-mono font-bold text-sm">
                                {activeConversation.metadata?.name || 'Records Session'}
                            </span>
                            <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/30 font-mono text-xs ml-2">
                                LIVE
                            </Badge>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {messages.length === 0 && (
                                <div className="text-center text-slate-500 font-mono text-sm mt-8">
                                    Ask me to search, create, or update a record...
                                </div>
                            )}
                            {messages.map((msg, i) => (
                                <MessageBubble key={i} message={msg} />
                            ))}
                            {sending && (
                                <div className="flex gap-3">
                                    <div className="w-7 h-7 rounded-lg bg-purple-600/30 flex items-center justify-center">
                                        <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
                                    </div>
                                    <div className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-2.5">
                                        <span className="text-slate-400 font-mono text-sm">Searching records...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="p-4 border-t border-slate-800">
                            <div className="flex gap-3">
                                <Input
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={handleKey}
                                    placeholder="Search a person, create a report, link a call..."
                                    className="bg-slate-800 border-slate-700 text-white placeholder-slate-500 font-mono flex-1"
                                    disabled={sending}
                                />
                                <Button onClick={sendMessage} disabled={sending || !input.trim()} className="bg-purple-600 hover:bg-purple-700">
                                    <Send className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function MessageBubble({ message }) {
    const isUser = message.role === 'user';
    return (
        <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {!isUser && (
                <div className="w-7 h-7 rounded-lg bg-purple-600/30 flex items-center justify-center mt-0.5 shrink-0">
                    <Bot className="w-3 h-3 text-purple-400" />
                </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                isUser
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-800 border border-slate-700 text-slate-200'
            }`}>
                {isUser ? (
                    <p className="text-sm font-mono">{message.content}</p>
                ) : (
                    <ReactMarkdown className="text-sm prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        {message.content}
                    </ReactMarkdown>
                )}
            </div>
        </div>
    );
}