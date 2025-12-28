import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { MessageSquare, Send, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function MessagingPanel({ currentUser, units, isOpen, onClose }) {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [selectedRecipient, setSelectedRecipient] = useState('dispatch');

    useEffect(() => {
        if (isOpen) {
            loadMessages();
            const interval = setInterval(loadMessages, 5000);
            return () => clearInterval(interval);
        }
    }, [isOpen]);

    const loadMessages = async () => {
        try {
            // Load ALL messages - everyone can see all communications
            const allMessages = await base44.entities.Message.list('-created_date', 200);
            setMessages(allMessages || []);
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    };

    const sendMessage = async () => {
        if (!newMessage.trim()) return;
        
        try {
            await base44.entities.Message.create({
                sender_id: currentUser.id,
                sender_name: currentUser.unit_number || currentUser.full_name,
                recipient_id: selectedRecipient,
                recipient_name: selectedRecipient === 'dispatch' ? 'Dispatch' : units.find(u => u.id === selectedRecipient)?.unit_number || 'Unit',
                message: newMessage,
                read: false
            });
            
            setNewMessage('');
            await loadMessages();
            toast.success('Message sent');
        } catch (error) {
            console.error('Error sending message:', error);
            toast.error('Failed to send message');
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, x: 300 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 300 }}
                    className="fixed right-0 top-0 bottom-0 w-96 bg-slate-900 border-l border-slate-700 z-50 flex flex-col"
                >
                    <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-blue-500" />
                            Messages
                        </h3>
                        <Button variant="ghost" size="icon" onClick={onClose}>
                            <X className="w-4 h-4" />
                        </Button>
                    </div>

                    <ScrollArea className="flex-1 p-4">
                        <div className="space-y-3">
                            {messages.map(msg => (
                                <div
                                    key={msg.id}
                                    className={`p-3 rounded-lg ${
                                        msg.sender_id === currentUser.id
                                            ? 'bg-blue-900/30 ml-8'
                                            : 'bg-slate-800 mr-8'
                                    }`}
                                >
                                    <div className="flex items-start justify-between mb-1">
                                        <span className="text-xs font-semibold text-white">{msg.sender_name}</span>
                                        <span className="text-xs text-slate-500">
                                            {new Date(msg.created_date).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-300">{msg.message}</p>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>

                    <div className="p-4 border-t border-slate-700">
                        <select
                            value={selectedRecipient}
                            onChange={(e) => setSelectedRecipient(e.target.value)}
                            className="flex h-9 w-full rounded-md border bg-slate-800 border-slate-700 text-white px-3 py-1 text-sm mb-2"
                        >
                            <option value="dispatch">Dispatch</option>
                            {units.map(unit => (
                                <option key={unit.id} value={unit.id}>
                                    {unit.unit_number || unit.full_name}
                                </option>
                            ))}
                        </select>
                        <div className="flex gap-2">
                            <Input
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                                placeholder="Type message..."
                                className="bg-slate-800 border-slate-700 text-white"
                            />
                            <Button onClick={sendMessage} size="sm">
                                <Send className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}