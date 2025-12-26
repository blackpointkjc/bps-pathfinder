import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function SearchBar({ onSearch, isSearching, onClear }) {
    const [query, setQuery] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (query.trim()) {
            onSearch(query.trim());
        }
    };

    const handleClear = () => {
        setQuery('');
        onClear?.();
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-4 left-4 right-4 z-[1000] md:left-1/2 md:-translate-x-1/2 md:w-[480px] md:right-auto"
        >
            <form onSubmit={handleSubmit} className="relative">
                <div className="relative flex items-center bg-white/95 backdrop-blur-xl rounded-2xl shadow-lg shadow-black/10 border border-white/20 overflow-hidden">
                    <div className="pl-4 text-gray-400">
                        {isSearching ? (
                            <Loader2 className="w-5 h-5 animate-spin text-[#007AFF]" />
                        ) : (
                            <Search className="w-5 h-5" />
                        )}
                    </div>
                    <Input
                        type="text"
                        placeholder="Search destination..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="flex-1 border-0 bg-transparent text-[#1D1D1F] placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 h-14 text-base px-3"
                    />
                    <AnimatePresence>
                        {query && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                            >
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleClear}
                                    className="mr-2 h-8 w-8 rounded-full bg-gray-100 hover:bg-gray-200"
                                >
                                    <X className="w-4 h-4 text-gray-500" />
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <Button
                        type="submit"
                        disabled={!query.trim() || isSearching}
                        className="mr-2 h-10 px-5 rounded-xl bg-[#007AFF] hover:bg-[#0056CC] text-white font-medium"
                    >
                        Go
                    </Button>
                </div>
            </form>
        </motion.div>
    );
}