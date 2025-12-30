import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, X, MapPin, Loader2, Home, School, DollarSign, Calendar, Users, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { ScrollArea } from '@/components/ui/scroll-area';
import ReactMarkdown from 'react-markdown';

export default function AddressLookupTool({ isOpen, onClose, onLocationFound }) {
    const [address, setAddress] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState(null);

    const handleSearch = async () => {
        if (!address.trim()) {
            toast.error('Please enter an address');
            return;
        }

        setIsSearching(true);
        setResults(null);

        try {
            // Geocode the address first
            toast.info('Looking up address...');
            const geoResponse = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Virginia, USA')}&limit=5`,
                { headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' } }
            );
            const geoData = await geoResponse.json();

            if (!geoData || geoData.length === 0) {
                toast.error('Address not found');
                setIsSearching(false);
                return;
            }

            // Prefer Virginia results
            const location = geoData.find(r => r.display_name.toLowerCase().includes('virginia')) || geoData[0];
            const coords = [parseFloat(location.lat), parseFloat(location.lon)];
            
            toast.success('Address found! Getting detailed information...');

            // Get comprehensive property information using AI
            const aiResponse = await base44.integrations.Core.InvokeLLM({
                prompt: `Provide comprehensive information about this address: ${location.display_name}

Search public records, school district databases, county assessor records, real estate listings, and other public sources to find:

**PROPERTY OWNERSHIP & VALUE**
• Current Owner Name(s)
• Property Value / Assessed Value
• Last Sale Date & Price
• Annual Property Tax

**PROPERTY DETAILS**
• Year Built
• Property Type (Single Family, Commercial, etc.)
• Square Footage
• Lot Size
• Number of Bedrooms/Bathrooms (if residential)

**LOCATION & SCHOOLS**
• Neighborhood Name
• School District
• Elementary School (with rating if available)
• Middle School (with rating if available)
• High School (with rating if available)

**AREA INFORMATION**
• Crime Rate / Safety Rating
• Nearby Amenities (parks, shopping, hospitals)
• Public Transportation Access

Format as organized sections with bullet points. If information is unavailable, state "Not available" for that item.`,
                add_context_from_internet: true
            });

            setResults({
                address: location.display_name,
                coords: coords,
                information: aiResponse || 'Unable to retrieve detailed information'
            });

            // Notify parent to show location on map
            if (onLocationFound) {
                onLocationFound(coords, location.display_name);
            }

            toast.success('Information loaded!');
        } catch (error) {
            console.error('Lookup error:', error);
            toast.error('Failed to get address information');
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="fixed left-16 top-24 w-[420px] max-h-[calc(100vh-8rem)] bg-white rounded-2xl shadow-2xl z-[10000] flex flex-col pointer-events-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                        <Search className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold">Address Lookup Tool</h2>
                                        <p className="text-blue-100 text-sm">Get detailed property information</p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={onClose}
                                    className="rounded-full hover:bg-white/20 text-white"
                                >
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>
                        </div>

                        {/* Search Input */}
                        <div className="p-6 border-b bg-gray-50">
                            <div className="flex gap-3">
                                <div className="flex-1 relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <Input
                                        placeholder="Enter full address (e.g. 123 Main St, Richmond, VA)"
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && !isSearching && handleSearch()}
                                        className="pl-10 h-12 text-base"
                                        disabled={isSearching}
                                    />
                                </div>
                                <Button
                                    onClick={handleSearch}
                                    disabled={isSearching || !address.trim()}
                                    size="lg"
                                    className="bg-blue-600 hover:bg-blue-700 px-8"
                                >
                                    {isSearching ? (
                                        <>
                                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                            Searching...
                                        </>
                                    ) : (
                                        <>
                                            <Search className="w-5 h-5 mr-2" />
                                            Search
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>

                        {/* Results */}
                        <ScrollArea className="flex-1 overflow-y-auto">
                            <div className="p-6 min-h-full">
                                {isSearching && (
                                    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                                        <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
                                        <p className="text-lg font-medium">Searching databases...</p>
                                        <p className="text-sm">This may take a few moments</p>
                                    </div>
                                )}

                                {!isSearching && !results && (
                                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                        <Home className="w-16 h-16 mb-4" />
                                        <p className="text-lg font-medium">Enter an address to get started</p>
                                        <p className="text-sm">We'll search public records for property details</p>
                                    </div>
                                )}

                                {results && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="space-y-4"
                                    >
                                        {/* Address Header */}
                                        <Card className="border-2 border-blue-200 bg-blue-50">
                                            <CardHeader className="pb-3">
                                                <CardTitle className="flex items-center gap-2 text-blue-900 text-base">
                                                    <MapPin className="w-5 h-5" />
                                                    {results.address.split(',').slice(0, 2).join(',')}
                                                </CardTitle>
                                                <p className="text-xs text-blue-700">{results.address.split(',').slice(2).join(',')}</p>
                                            </CardHeader>
                                        </Card>

                                        {/* Information Display with Markdown */}
                                        <Card>
                                            <CardContent className="pt-6">
                                                <ReactMarkdown
                                                    className="prose prose-sm max-w-none"
                                                    components={{
                                                        a: ({ node, ...props }) => (
                                                            <a 
                                                                {...props} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer"
                                                                className="text-blue-600 hover:text-blue-800 underline font-medium"
                                                            />
                                                        ),
                                                        h1: ({ node, ...props }) => (
                                                            <h1 {...props} className="text-xl font-bold text-gray-900 mt-4 mb-2" />
                                                        ),
                                                        h2: ({ node, ...props }) => (
                                                            <h2 {...props} className="text-lg font-bold text-gray-900 mt-4 mb-2" />
                                                        ),
                                                        h3: ({ node, ...props }) => (
                                                            <h3 {...props} className="text-base font-bold text-gray-800 mt-3 mb-1" />
                                                        ),
                                                        p: ({ node, ...props }) => (
                                                            <p {...props} className="text-gray-700 leading-relaxed mb-2" />
                                                        ),
                                                        ul: ({ node, ...props }) => (
                                                            <ul {...props} className="list-disc pl-5 space-y-1 mb-3" />
                                                        ),
                                                        li: ({ node, ...props }) => (
                                                            <li {...props} className="text-gray-700" />
                                                        ),
                                                        strong: ({ node, ...props }) => (
                                                            <strong {...props} className="font-bold text-gray-900" />
                                                        ),
                                                    }}
                                                >
                                                    {results.information}
                                                </ReactMarkdown>
                                            </CardContent>
                                        </Card>

                                        {/* Quick Stats Icons */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                                                <Users className="w-5 h-5 text-green-600 mx-auto mb-1" />
                                                <p className="text-xs font-medium text-green-900">Owner Info</p>
                                            </div>
                                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                                                <School className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                                                <p className="text-xs font-medium text-blue-900">Schools</p>
                                            </div>
                                            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
                                                <DollarSign className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                                                <p className="text-xs font-medium text-purple-900">Value</p>
                                            </div>
                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                                                <Calendar className="w-5 h-5 text-amber-600 mx-auto mb-1" />
                                                <p className="text-xs font-medium text-amber-900">Year Built</p>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        </ScrollArea>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}