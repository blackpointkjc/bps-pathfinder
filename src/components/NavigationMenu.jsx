import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Menu, Radio, Users, Activity, BarChart3, MapPin, Shield, Clock, FileText, Archive } from 'lucide-react';
import { createPageUrl } from '../utils';

export default function NavigationMenu({ currentUser }) {
    const [open, setOpen] = useState(false);

    const menuItems = [
        { name: 'CAD Home', icon: Radio, page: 'CADHome', color: 'text-blue-400' },
        { name: 'Active Calls Management', icon: Radio, page: 'ActiveCalls', color: 'text-red-400' },
        { name: 'Units', icon: Users, page: 'Units', color: 'text-green-400' },
        { name: 'Dispatch Center', icon: Activity, page: 'DispatchCenter', color: 'text-purple-400' },
        { name: 'Call History', icon: FileText, page: 'CallHistory', color: 'text-orange-400' },
        { name: 'Live Map', icon: MapPin, page: 'Navigation', color: 'text-yellow-400' },
    ];

    if (currentUser?.role === 'admin') {
        menuItems.push(
            { name: 'Admin Portal', icon: Shield, page: 'AdminPortal', color: 'text-red-400' }
        );
    }

    const navigate = (page) => {
        window.location.href = createPageUrl(page);
        setOpen(false);
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button 
                    variant="outline" 
                    size="icon"
                    className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white"
                >
                    <Menu className="w-5 h-5" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 bg-slate-900 border-slate-700">
                <SheetHeader>
                    <SheetTitle className="text-white font-mono text-xl flex items-center gap-2">
                        <Radio className="w-6 h-6 text-blue-400" />
                        CAD NAVIGATION
                    </SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-2">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.page}
                                onClick={() => navigate(item.page)}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 transition-all text-left border border-slate-700 hover:border-slate-600"
                            >
                                <Icon className={`w-5 h-5 ${item.color}`} />
                                <span className="text-white font-mono text-sm">{item.name}</span>
                            </button>
                        );
                    })}
                </div>
                
                <div className="absolute bottom-6 left-6 right-6">
                    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                        <p className="text-xs text-slate-400 font-mono mb-1">LOGGED IN AS</p>
                        <p className="text-white font-mono text-sm font-bold">
                            {currentUser?.rank && currentUser?.last_name 
                                ? `${currentUser.rank} ${currentUser.last_name}` 
                                : currentUser?.full_name}
                        </p>
                        {currentUser?.unit_number && (
                            <p className="text-blue-400 font-mono text-xs mt-1">UNIT-{currentUser.unit_number}</p>
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}