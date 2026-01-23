import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Search, MapPin, Home, DollarSign, Calendar, User, Loader2, FileText } from 'lucide-react';

export default function CarolineGISLookup() {
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [propertyData, setPropertyData] = useState(null);

    const searchProperty = async () => {
        if (!searchQuery.trim()) {
            toast.error('Please enter an address or parcel ID');
            return;
        }

        setIsSearching(true);
        try {
            const response = await base44.integrations.Core.InvokeLLM({
                prompt: `Search Caroline County, Virginia property records and GIS data for: ${searchQuery}

Using Caroline County public records, assessor databases, GIS/parcel data (including Regrid data if available), and property tax records, find:

1. **Property Address**: Full street address
2. **Parcel ID/Tax Map Number**: Official parcel identifier
3. **Owner Information**: Current owner name(s) and mailing address
4. **Property Value**: Current assessed value or market value
5. **Property Type**: Residential/Commercial/Agricultural/etc.
6. **Land Area**: Lot size in acres
7. **Year Built**: Construction year if applicable
8. **Last Sale**: Date and price of most recent sale
9. **Tax Information**: Annual property tax amount
10. **Zoning**: Current zoning classification
11. **Legal Description**: Brief legal description
12. **Coordinates**: Latitude and longitude if available

Format as a structured JSON object with these exact keys: address, parcel_id, owner_name, owner_mailing_address, assessed_value, property_type, land_area, year_built, last_sale_date, last_sale_price, annual_tax, zoning, legal_description, latitude, longitude.

If data is not available, use null for that field.
Be thorough and search Caroline County specific sources.`,
                add_context_from_internet: true,
                response_json_schema: {
                    type: "object",
                    properties: {
                        address: { type: "string" },
                        parcel_id: { type: "string" },
                        owner_name: { type: "string" },
                        owner_mailing_address: { type: "string" },
                        assessed_value: { type: "string" },
                        property_type: { type: "string" },
                        land_area: { type: "string" },
                        year_built: { type: "string" },
                        last_sale_date: { type: "string" },
                        last_sale_price: { type: "string" },
                        annual_tax: { type: "string" },
                        zoning: { type: "string" },
                        legal_description: { type: "string" },
                        latitude: { type: "number" },
                        longitude: { type: "number" }
                    }
                }
            });

            if (response) {
                setPropertyData(response);
                toast.success('Property data retrieved');
            } else {
                toast.error('No property data found');
            }
        } catch (error) {
            console.error('Property lookup error:', error);
            toast.error('Failed to lookup property');
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <div className="space-y-4">
            <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-blue-500" />
                        Caroline County GIS Property Lookup
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && searchProperty()}
                            placeholder="Enter address or parcel ID..."
                            className="flex-1 bg-slate-900 border-slate-700 text-white"
                            disabled={isSearching}
                        />
                        <Button
                            onClick={searchProperty}
                            disabled={isSearching}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            {isSearching ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Search className="w-4 h-4" />
                            )}
                        </Button>
                    </div>

                    {propertyData && (
                        <div className="space-y-3 mt-4">
                            {/* Address & Parcel */}
                            {propertyData.address && (
                                <div className="bg-slate-900 p-3 rounded-lg">
                                    <div className="flex items-start gap-2">
                                        <Home className="w-4 h-4 text-blue-400 mt-1" />
                                        <div>
                                            <div className="text-xs text-slate-400">Address</div>
                                            <div className="text-white font-semibold">{propertyData.address}</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {propertyData.parcel_id && (
                                <div className="bg-slate-900 p-3 rounded-lg">
                                    <div className="flex items-start gap-2">
                                        <FileText className="w-4 h-4 text-green-400 mt-1" />
                                        <div>
                                            <div className="text-xs text-slate-400">Parcel ID / Tax Map Number</div>
                                            <div className="text-white font-mono">{propertyData.parcel_id}</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Owner Information */}
                            {propertyData.owner_name && (
                                <div className="bg-slate-900 p-3 rounded-lg">
                                    <div className="flex items-start gap-2">
                                        <User className="w-4 h-4 text-purple-400 mt-1" />
                                        <div className="flex-1">
                                            <div className="text-xs text-slate-400">Owner</div>
                                            <div className="text-white">{propertyData.owner_name}</div>
                                            {propertyData.owner_mailing_address && (
                                                <div className="text-xs text-slate-400 mt-1">{propertyData.owner_mailing_address}</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Property Details Grid */}
                            <div className="grid grid-cols-2 gap-3">
                                {propertyData.assessed_value && (
                                    <div className="bg-slate-900 p-3 rounded-lg">
                                        <div className="flex items-start gap-2">
                                            <DollarSign className="w-4 h-4 text-green-400 mt-1" />
                                            <div>
                                                <div className="text-xs text-slate-400">Assessed Value</div>
                                                <div className="text-white font-semibold">{propertyData.assessed_value}</div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {propertyData.property_type && (
                                    <div className="bg-slate-900 p-3 rounded-lg">
                                        <div className="text-xs text-slate-400">Type</div>
                                        <Badge className="mt-1 bg-blue-600">{propertyData.property_type}</Badge>
                                    </div>
                                )}

                                {propertyData.land_area && (
                                    <div className="bg-slate-900 p-3 rounded-lg">
                                        <div className="text-xs text-slate-400">Land Area</div>
                                        <div className="text-white">{propertyData.land_area}</div>
                                    </div>
                                )}

                                {propertyData.year_built && (
                                    <div className="bg-slate-900 p-3 rounded-lg">
                                        <div className="flex items-start gap-2">
                                            <Calendar className="w-4 h-4 text-yellow-400 mt-1" />
                                            <div>
                                                <div className="text-xs text-slate-400">Year Built</div>
                                                <div className="text-white">{propertyData.year_built}</div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {propertyData.zoning && (
                                    <div className="bg-slate-900 p-3 rounded-lg col-span-2">
                                        <div className="text-xs text-slate-400">Zoning</div>
                                        <div className="text-white">{propertyData.zoning}</div>
                                    </div>
                                )}
                            </div>

                            {/* Last Sale */}
                            {(propertyData.last_sale_date || propertyData.last_sale_price) && (
                                <div className="bg-slate-900 p-3 rounded-lg">
                                    <div className="text-xs text-slate-400 mb-1">Last Sale</div>
                                    <div className="text-white">
                                        {propertyData.last_sale_date && <span>{propertyData.last_sale_date}</span>}
                                        {propertyData.last_sale_date && propertyData.last_sale_price && <span> • </span>}
                                        {propertyData.last_sale_price && <span className="font-semibold">{propertyData.last_sale_price}</span>}
                                    </div>
                                </div>
                            )}

                            {/* Annual Tax */}
                            {propertyData.annual_tax && (
                                <div className="bg-slate-900 p-3 rounded-lg">
                                    <div className="text-xs text-slate-400">Annual Property Tax</div>
                                    <div className="text-white font-semibold">{propertyData.annual_tax}</div>
                                </div>
                            )}

                            {/* Legal Description */}
                            {propertyData.legal_description && (
                                <div className="bg-slate-900 p-3 rounded-lg">
                                    <div className="text-xs text-slate-400 mb-1">Legal Description</div>
                                    <div className="text-white text-sm">{propertyData.legal_description}</div>
                                </div>
                            )}

                            {/* Coordinates */}
                            {propertyData.latitude && propertyData.longitude && (
                                <div className="bg-slate-900 p-3 rounded-lg">
                                    <div className="text-xs text-slate-400 mb-1">Coordinates</div>
                                    <div className="text-white font-mono text-sm">
                                        {propertyData.latitude.toFixed(6)}, {propertyData.longitude.toFixed(6)}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}