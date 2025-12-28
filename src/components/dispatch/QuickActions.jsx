import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Radio, AlertCircle, Users, Car, Shield, Ambulance, Flame } from 'lucide-react';
import { motion } from 'framer-motion';

export default function QuickActions({ onCreateCall }) {
    const quickCallTypes = [
        { type: 'Traffic Accident', icon: Car, color: 'bg-orange-600', priority: 'high' },
        { type: 'Medical Emergency', icon: Ambulance, color: 'bg-red-600', priority: 'critical' },
        { type: 'Fire', icon: Flame, color: 'bg-red-700', priority: 'critical' },
        { type: 'Burglary', icon: Shield, color: 'bg-purple-600', priority: 'high' },
        { type: 'Welfare Check', icon: Users, color: 'bg-blue-600', priority: 'medium' },
        { type: 'Suspicious Activity', icon: AlertCircle, color: 'bg-yellow-600', priority: 'medium' }
    ];

    return (
        <Card className="p-4 bg-slate-900/95 border-slate-700">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Radio className="w-4 h-4 text-red-500" />
                Quick Dispatch
            </h3>
            <div className="grid grid-cols-3 gap-2">
                {quickCallTypes.map((callType, idx) => (
                    <motion.div key={callType.type} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.05 }}>
                        <Button
                            onClick={() => onCreateCall(callType)}
                            className={`${callType.color} hover:opacity-90 w-full h-20 flex flex-col items-center justify-center gap-1`}
                        >
                            <callType.icon className="w-5 h-5" />
                            <span className="text-xs text-center leading-tight">{callType.type}</span>
                        </Button>
                    </motion.div>
                ))}
            </div>
        </Card>
    );
}