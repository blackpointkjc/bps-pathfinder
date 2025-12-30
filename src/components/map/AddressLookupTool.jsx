import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, X, MapPin, Loader2, Home, School, DollarSign, Calendar, Users, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { ScrollArea } from '@/components/ui/scroll-area';

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
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="fixed inset-4 md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:inset-auto md:w-[600px] md:max-h-[85vh] bg-white rounded-2xl shadow-2xl z-[10000] overflow-hidden pointer-events-auto"
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
                        <ScrollArea className="h-[calc(90vh-280px)]">
                            <div className="p-6">
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
                                            <CardHeader>
                                                <CardTitle className="flex items-center gap-2 text-blue-900">
                                                    <MapPin className="w-5 h-5" />
                                                    {results.address.split(',').slice(0, 2).join(',')}
                                                </CardTitle>
                                                <p className="text-sm text-blue-700">{results.address.split(',').slice(2).join(',')}</p>
                                            </CardHeader>
                                        </Card>

                                        {/* Information Display */}
                                        <Card>
                                            <CardContent className="pt-6">
                                                <div className="prose prose-sm max-w-none">
                                                    <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
                                                        {results.information}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* Quick Stats Icons */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                                                <Users className="w-6 h-6 text-green-600 mx-auto mb-1" />
                                                <p className="text-xs font-medium text-green-900">Owner Info</p>
                                            </div>
                                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                                                <School className="w-6 h-6 text-blue-600 mx-auto mb-1" />
                                                <p className="text-xs font-medium text-blue-900">Schools</p>
                                            </div>
                                            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
                                                <DollarSign className="w-6 h-6 text-purple-600 mx-auto mb-1" />
                                                <p className="text-xs font-medium text-purple-900">Value</p>
                                            </div>
                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                                                <Calendar className="w-6 h-6 text-amber-600 mx-auto mb-1" />
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