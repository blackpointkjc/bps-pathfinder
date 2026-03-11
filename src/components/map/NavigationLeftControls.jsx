import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { RefreshCw, CheckCircle2, MapPin, Car, XCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function NavigationLeftControls({
    isNavigating, unitStatus, isLocating,
    getCurrentLocation, handleStatusChange,
    clearRoute, currentUser, setUnitStatus, setActiveCallInfo
}) {
    if (isNavigating) return null;

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute bottom-1/2 translate-y-1/2 left-2 z-[1002] flex flex-col gap-1.5 pointer-events-auto"
        >
            <Button
                onClick={getCurrentLocation}
                size="sm"
                disabled={isLocating}
                className="bg-blue-600 hover:bg-blue-700 shadow-lg w-12 h-12 flex flex-col items-center justify-center gap-0.5 rounded-lg pointer-events-auto"
                title="Refresh GPS Location"
            >
                <RefreshCw className={`w-4 h-4 text-white ${isLocating ? 'animate-spin' : ''}`} />
                <span className="text-[8px] font-semibold text-white">GPS</span>
            </Button>
            <Button
                onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveCallInfo(null);
                    clearRoute();
                    if (currentUser) {
                        try {
                            await base44.auth.updateMe({ current_call_id: null, current_call_info: null, status: 'Available' });
                            setUnitStatus('Available');
                            toast.success('Available');
                        } catch (error) {
                            console.error('Error clearing call:', error);
                        }
                    }
                }}
                size="sm"
                className={`${unitStatus === 'Available' ? 'bg-green-600 hover:bg-green-700' : 'bg-white/95 hover:bg-white'} shadow-lg w-12 h-12 flex flex-col items-center justify-center gap-0.5 rounded-lg pointer-events-auto`}
            >
                <CheckCircle2 className={`w-4 h-4 ${unitStatus === 'Available' ? 'text-white' : 'text-green-600'}`} />
                <span className={`text-[8px] font-semibold ${unitStatus === 'Available' ? 'text-white' : 'text-gray-700'}`}>Avail</span>
            </Button>
            <Button onClick={() => handleStatusChange('On Scene')} size="sm" className={`${unitStatus === 'On Scene' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-white/95 hover:bg-white'} shadow-lg w-12 h-12 flex flex-col items-center justify-center gap-0.5 rounded-lg`}>
                <MapPin className={`w-4 h-4 ${unitStatus === 'On Scene' ? 'text-white' : 'text-blue-600'}`} />
                <span className={`text-[8px] font-semibold ${unitStatus === 'On Scene' ? 'text-white' : 'text-gray-700'}`}>Scene</span>
            </Button>
            <Button onClick={() => handleStatusChange('On Patrol')} size="sm" className={`${unitStatus === 'On Patrol' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-white/95 hover:bg-white'} shadow-lg w-12 h-12 flex flex-col items-center justify-center gap-0.5 rounded-lg`}>
                <Car className={`w-4 h-4 ${unitStatus === 'On Patrol' ? 'text-white' : 'text-indigo-600'}`} />
                <span className={`text-[8px] font-semibold ${unitStatus === 'On Patrol' ? 'text-white' : 'text-gray-700'}`}>Patrol</span>
            </Button>
            <Button
                onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveCallInfo(null);
                    clearRoute();
                    if (currentUser) {
                        try {
                            await base44.auth.updateMe({ show_on_map: false, current_call_id: null, current_call_info: null, status: 'Out of Service' });
                            setUnitStatus('Out of Service');
                            toast.success('Out of Service - Hidden from map');
                        } catch (error) {
                            console.error('Error updating status:', error);
                        }
                    }
                }}
                size="sm"
                className={`${unitStatus === 'Out of Service' ? 'bg-gray-600 hover:bg-gray-700' : 'bg-white/95 hover:bg-white'} shadow-lg w-12 h-12 flex flex-col items-center justify-center gap-0.5 rounded-lg pointer-events-auto`}
            >
                <XCircle className={`w-4 h-4 ${unitStatus === 'Out of Service' ? 'text-white' : 'text-gray-600'}`} />
                <span className={`text-[8px] font-semibold ${unitStatus === 'Out of Service' ? 'text-white' : 'text-gray-700'}`}>OOS</span>
            </Button>
        </motion.div>
    );
}