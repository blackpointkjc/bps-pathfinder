import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Search, X, Loader2, Clock, MapPin } from 'lucide-react';

export default function SearchBarWithHistory({ onSearch, isSearching, onClear }) {
    const [query, setQuery] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [searchHistory, setSearchHistory] = useState([]);

    useEffect(() => {
        const history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
        setSearchHistory(history);
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        console.log('🔍 SearchBar: Form submitted with query:', query);
        if (!query.trim()) {
            console.log('⚠️ SearchBar: Empty query, ignoring');
            return;
        }

        // Add to history
        const newHistory = [query, ...searchHistory.filter(h => h !== query)].slice(0, 5);
        setSearchHistory(newHistory);
        localStorage.setItem('searchHistory', JSON.stringify(newHistory));

        console.log('✅ SearchBar: Calling onSearch with:', query);
        onSearch(query);
        setShowHistory(false);
    };

    const selectFromHistory = (item) => {
        console.log('🔍 SearchBar: Selected from history:', item);
        setQuery(item);
        onSearch(item);
        setShowHistory(false);
    };

    const clearHistory = () => {
        setSearchHistory([]);
        localStorage.setItem('searchHistory', '[]');
    };

    const handleClear = () => {
        setQuery('');
        onClear();
        setShowHistory(false);
    };

    return (
        <div className="relative pointer-events-auto">
            <form onSubmit={handleSubmit} className="relative pointer-events-auto">
                <div className="relative bg-white/98 backdrop-blur-xl shadow-xl rounded-2xl border border-gray-200/50">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => setShowHistory(true)}
                        placeholder="Search destination..."
                        className="pl-12 pr-24 h-14 text-base border-0 bg-transparent focus-visible:ring-0 pointer-events-auto"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-2">
                        {query && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                            >
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleClear}
                                    className="h-10 w-10 rounded-xl hover:bg-gray-100"
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </motion.div>
                        )}
                        <Button
                            type="submit"
                            disabled={isSearching || !query.trim()}
                            className="h-10 rounded-xl bg-blue-600 hover:bg-blue-700"
                        >
                            {isSearching ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                'Go'
                            )}
                        </Button>
                    </div>
                </div>
            </form>

            <AnimatePresence>
                {showHistory && searchHistory.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full mt-2 w-full z-[1001]"
                    >
                        <Card className="bg-white/98 backdrop-blur-xl shadow-xl border border-gray-200/50 p-2">
                            <div className="flex items-center justify-between px-3 py-2">
                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Recent</span>
                                <Button variant="ghost" size="sm" onClick={clearHistory} className="h-6 text-xs">
                                    Clear
                                </Button>
                            </div>
                            <div className="space-y-1">
                                {searchHistory.map((item, index) => (
                                    <button
                                        key={index}
                                        onClick={() => selectFromHistory(item)}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-100 rounded-lg transition-colors text-left"
                                    >
                                        <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                        <span className="text-sm text-gray-700 truncate">{item}</span>
                                    </button>
                                ))}
                            </div>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}