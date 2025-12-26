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
        <div>
            <form onSubmit={handleSubmit} className="relative">
                <div className="relative flex items-center bg-white/98 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-black/5 border border-gray-200/50 overflow-hidden">
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
                        className="mr-2 h-10 px-6 rounded-2xl bg-[#007AFF] hover:bg-[#0056CC] text-white font-semibold shadow-md"
                    >
                        Go
                    </Button>
                </div>
            </form>
        </div>
    );
}