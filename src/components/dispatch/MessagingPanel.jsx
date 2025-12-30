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
            // Load only messages where user is sender, recipient, or recipient is 'dispatch'
            const allMessages = await base44.entities.Message.list('-created_date', 200);
            
            const filteredMessages = allMessages.filter(msg => {
                // Show if user is the sender
                if (msg.sender_id === currentUser.id) return true;
                
                // Show if message is to/from dispatch (broadcast)
                if (msg.recipient_id === 'dispatch' || msg.sender_id === 'dispatch') return true;
                
                // Show if user is the recipient
                if (msg.recipient_id === currentUser.id) return true;
                
                // Otherwise hide
                return false;
            });
            
            setMessages(filteredMessages || []);
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

                    <ScrollArea className="flex-1 p-4 bg-slate-950">
                        <div className="space-y-2">
                            {messages.map(msg => {
                                const isOwnMessage = msg.sender_id === currentUser.id;
                                // Generate consistent color based on sender ID
                                const senderHue = msg.sender_id === 'dispatch' ? 200 : 
                                    Array.from(msg.sender_id).reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
                                
                                return (
                                    <div
                                        key={msg.id}
                                        className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div className={`max-w-[75%] ${isOwnMessage ? 'ml-12' : 'mr-12'}`}>
                                            {!isOwnMessage && (
                                                <div className="text-xs font-semibold mb-1 px-1"
                                                    style={{ color: `hsl(${senderHue}, 60%, 60%)` }}>
                                                    {msg.sender_name}
                                                </div>
                                            )}
                                            <div
                                                className={`rounded-2xl px-4 py-2 shadow-sm ${
                                                    isOwnMessage
                                                        ? 'bg-blue-500 text-white rounded-br-sm'
                                                        : 'text-white rounded-bl-sm'
                                                }`}
                                                style={!isOwnMessage ? {
                                                    background: `hsl(${senderHue}, 40%, 35%)`
                                                } : {}}
                                            >
                                                <p className="text-sm leading-relaxed">{msg.message}</p>
                                            </div>
                                            <div className={`text-[10px] text-slate-500 mt-1 px-1 ${
                                                isOwnMessage ? 'text-right' : 'text-left'
                                            }`}>
                                                {new Date(msg.created_date).toLocaleTimeString('en-US', { 
                                                    timeZone: 'America/New_York',
                                                    hour: 'numeric',
                                                    minute: '2-digit',
                                                    hour12: true
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>

                    <div className="p-4 border-t border-slate-700 bg-slate-900">
                        <select
                            value={selectedRecipient}
                            onChange={(e) => setSelectedRecipient(e.target.value)}
                            className="flex h-9 w-full rounded-xl border bg-slate-800 border-slate-700 text-white px-3 py-1 text-sm mb-2"
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
                                placeholder="iMessage"
                                className="bg-slate-800 border-slate-700 text-white rounded-full px-4"
                            />
                            <Button onClick={sendMessage} size="icon" className="rounded-full bg-blue-500 hover:bg-blue-600">
                                <Send className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}