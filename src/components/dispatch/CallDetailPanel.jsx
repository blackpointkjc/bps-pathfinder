import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { MapPin, Clock, User, Phone, AlertTriangle, FileText, Send, Save } from 'lucide-react';
import { motion } from 'framer-motion';

export default function CallDetailPanel({ call, currentUser, onUpdate, units }) {
    const [notes, setNotes] = useState([]);
    const [newNote, setNewNote] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [editedCall, setEditedCall] = useState(call);

    useEffect(() => {
        if (call) {
            setEditedCall(call);
            loadNotes();
        }
    }, [call?.id]);

    const loadNotes = async () => {
        if (!call) return;
        try {
            const notesData = await base44.entities.CallNote.filter({ call_id: call.id });
            setNotes(notesData || []);
        } catch (error) {
            console.error('Error loading notes:', error);
        }
    };

    const addNote = async () => {
        if (!newNote.trim() || !call) return;
        
        try {
            await base44.entities.CallNote.create({
                call_id: call.id,
                author_id: currentUser.id,
                author_name: currentUser.full_name,
                note: newNote,
                note_type: 'general'
            });
            
            setNewNote('');
            await loadNotes();
            toast.success('Note added');
        } catch (error) {
            console.error('Error adding note:', error);
            toast.error('Failed to add note');
        }
    };

    const saveChanges = async () => {
        try {
            await base44.entities.DispatchCall.update(call.id, editedCall);
            
            // Create audit log
            await base44.entities.AuditLog.create({
                entity_type: 'DispatchCall',
                entity_id: call.id,
                action: 'update',
                actor_id: currentUser.id,
                actor_name: currentUser.full_name,
                before_value: JSON.stringify(call),
                after_value: JSON.stringify(editedCall),
                timestamp: new Date().toISOString()
            });
            
            setIsEditing(false);
            onUpdate();
            toast.success('Call updated');
        } catch (error) {
            console.error('Error updating call:', error);
            toast.error('Failed to update call');
        }
    };

    const updateStatus = async (newStatus) => {
        try {
            const updates = { status: newStatus };
            const timeField = `time_${newStatus.toLowerCase().replace(' ', '_')}`;
            updates[timeField] = new Date().toISOString();
            
            await base44.entities.DispatchCall.update(call.id, updates);
            
            await base44.entities.AuditLog.create({
                entity_type: 'DispatchCall',
                entity_id: call.id,
                action: 'status_change',
                actor_id: currentUser.id,
                actor_name: currentUser.full_name,
                before_value: call.status,
                after_value: newStatus,
                field_changed: 'status',
                timestamp: new Date().toISOString()
            });
            
            onUpdate();
            toast.success(`Status: ${newStatus}`);
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error('Failed to update status');
        }
    };

    if (!call) {
        return (
            <Card className="h-full bg-slate-900/95 border-slate-700 flex items-center justify-center">
                <div className="text-center text-slate-500">
                    <FileText className="w-16 h-16 mx-auto mb-3 opacity-50" />
                    <p>Select a call to view details</p>
                </div>
            </Card>
        );
    }

    const assignedUnits = units.filter(u => call.assigned_units?.includes(u.id));

    return (
        <Card className="h-full bg-slate-900/95 border-slate-700 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-700">
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <h2 className="text-2xl font-bold text-white">{call.incident}</h2>
                        <p className="text-sm text-slate-400">Call ID: {call.call_id || call.id}</p>
                    </div>
                    <Badge className={
                        call.priority === 'critical' ? 'bg-red-600' :
                        call.priority === 'high' ? 'bg-orange-500' :
                        call.priority === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                    }>
                        {call.priority}
                    </Badge>
                </div>

                {/* Status Buttons */}
                <div className="flex flex-wrap gap-2">
                    {['New', 'Dispatched', 'Enroute', 'On Scene', 'Cleared', 'Closed'].map(status => (
                        <Button
                            key={status}
                            size="sm"
                            variant={call.status === status ? 'default' : 'outline'}
                            onClick={() => updateStatus(status)}
                            className="text-xs"
                        >
                            {status}
                        </Button>
                    ))}
                </div>
            </div>

            <ScrollArea className="flex-1 p-4">
                {/* AI Summary */}
                {call.ai_summary && (
                    <div className="mb-6">
                        <div className="bg-blue-900/40 border border-blue-500/30 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-blue-300 mb-2 flex items-center gap-2">
                                <span>🤖</span>
                                AI Summary
                            </h3>
                            <p className="text-blue-100 text-sm">{call.ai_summary}</p>
                        </div>
                    </div>
                )}

                {/* Location Info */}
                <div className="mb-6">
                    <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-red-500" />
                        Location
                    </h3>
                    {isEditing ? (
                        <Input
                            value={editedCall.location}
                            onChange={(e) => setEditedCall({...editedCall, location: e.target.value})}
                            className="bg-slate-800 border-slate-700 text-white"
                        />
                    ) : (
                        <p className="text-slate-300">{call.location}</p>
                    )}
                    {call.cross_street && (
                        <p className="text-sm text-slate-400 mt-1">Cross: {call.cross_street}</p>
                    )}
                    {call.latitude && call.longitude && (
                        <>
                            <p className="text-xs text-slate-500 mt-1">
                                GPS: {call.latitude.toFixed(4)}, {call.longitude.toFixed(4)}
                            </p>
                            {/* Mini Map Preview */}
                            <div className="mt-3 h-32 rounded-lg overflow-hidden border border-slate-700">
                                <iframe
                                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${call.longitude-0.005},${call.latitude-0.005},${call.longitude+0.005},${call.latitude+0.005}&layer=mapnik&marker=${call.latitude},${call.longitude}`}
                                    className="w-full h-full"
                                    style={{border: 0}}
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Description */}
                {(call.description || isEditing) && (
                    <div className="mb-6">
                        <h3 className="text-sm font-semibold text-white mb-2">Description</h3>
                        {isEditing ? (
                            <Textarea
                                value={editedCall.description || ''}
                                onChange={(e) => setEditedCall({...editedCall, description: e.target.value})}
                                className="bg-slate-800 border-slate-700 text-white"
                                rows={3}
                            />
                        ) : (
                            <p className="text-slate-300">{call.description}</p>
                        )}
                    </div>
                )}

                {/* Timestamps */}
                <div className="mb-6">
                    <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-500" />
                        Timeline
                    </h3>
                    <div className="space-y-1 text-sm">
                        {call.time_received && (
                            <div className="flex justify-between text-slate-300">
                                <span>Received:</span>
                                <span>{new Date(call.time_received).toLocaleString('en-US', { timeZone: 'America/New_York' })}</span>
                            </div>
                        )}
                        {call.time_dispatched && (
                            <div className="flex justify-between text-slate-300">
                                <span>Dispatched:</span>
                                <span>{new Date(call.time_dispatched).toLocaleString('en-US', { timeZone: 'America/New_York' })}</span>
                            </div>
                        )}
                        {call.time_enroute && (
                            <div className="flex justify-between text-slate-300">
                                <span>Enroute:</span>
                                <span>{new Date(call.time_enroute).toLocaleString('en-US', { timeZone: 'America/New_York' })}</span>
                            </div>
                        )}
                        {call.time_on_scene && (
                            <div className="flex justify-between text-slate-300">
                                <span>On Scene:</span>
                                <span>{new Date(call.time_on_scene).toLocaleString('en-US', { timeZone: 'America/New_York' })}</span>
                            </div>
                        )}
                        {call.time_cleared && (
                            <div className="flex justify-between text-slate-300">
                                <span>Cleared:</span>
                                <span>{new Date(call.time_cleared).toLocaleString('en-US', { timeZone: 'America/New_York' })}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Caller Info */}
                {(call.caller_name || call.caller_phone) && (
                    <div className="mb-6">
                        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                            <User className="w-4 h-4 text-green-500" />
                            Caller
                        </h3>
                        {call.caller_name && <p className="text-slate-300">{call.caller_name}</p>}
                        {call.caller_phone && <p className="text-slate-400">{call.caller_phone}</p>}
                    </div>
                )}

                {/* Hazards */}
                {call.hazards && (
                    <div className="mb-6">
                        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            Hazards
                        </h3>
                        <p className="text-amber-400">{call.hazards}</p>
                    </div>
                )}

                {/* Assigned Units */}
                <div className="mb-6">
                    <h3 className="text-sm font-semibold text-white mb-2">Assigned Units</h3>
                    {assignedUnits.length > 0 ? (
                        <div className="space-y-2">
                            {assignedUnits.map(unit => (
                                <div key={unit.id} className="bg-slate-800 p-2 rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <span className="text-white font-semibold">{unit.unit_number || 'Unit'}</span>
                                        <Badge variant="outline" className="border-blue-500 text-blue-400">
                                            {unit.status}
                                        </Badge>
                                    </div>
                                    {unit.last_updated && (
                                        <p className="text-xs text-slate-400 mt-1">
                                            Last update: {new Date(unit.last_updated).toLocaleTimeString()}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Badge variant="outline" className="border-red-500 text-red-400">
                            No units assigned
                        </Badge>
                    )}
                </div>

                {/* Notes Feed */}
                <div className="mb-6">
                    <h3 className="text-sm font-semibold text-white mb-3">Notes & Narrative</h3>
                    
                    {/* Add Note */}
                    <div className="flex gap-2 mb-3">
                        <Input
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            placeholder="Add note..."
                            onKeyPress={(e) => e.key === 'Enter' && addNote()}
                            className="bg-slate-800 border-slate-700 text-white"
                        />
                        <Button onClick={addNote} size="sm">
                            <Send className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Notes List */}
                    <div className="space-y-2">
                        {notes.map(note => (
                            <div key={note.id} className="bg-slate-800 p-3 rounded-lg">
                                <div className="flex items-start justify-between mb-1">
                                    <span className="text-sm font-semibold text-white">{note.author_name}</span>
                                    <span className="text-xs text-slate-500">
                                        {new Date(note.created_date).toLocaleTimeString()}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-300">{note.note}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </ScrollArea>

            {/* Footer Actions */}
            <div className="p-4 border-t border-slate-700 flex gap-2">
                {isEditing ? (
                    <>
                        <Button onClick={saveChanges} className="flex-1 bg-green-600 hover:bg-green-700">
                            <Save className="w-4 h-4 mr-2" />
                            Save
                        </Button>
                        <Button onClick={() => setIsEditing(false)} variant="outline" className="flex-1">
                            Cancel
                        </Button>
                    </>
                ) : (
                    <Button onClick={() => setIsEditing(true)} className="flex-1" variant="outline">
                        Edit Call
                    </Button>
                )}
            </div>
        </Card>
    );
}