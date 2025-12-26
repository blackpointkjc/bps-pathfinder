import React from 'react';
import { Button } from "@/components/ui/button";
import { Navigation, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function LocationButton({ onClick, isLocating }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute bottom-32 right-4 z-[1000]"
        >
            <Button
                onClick={onClick}
                disabled={isLocating}
                size="icon"
                className="h-12 w-12 rounded-full bg-white/95 backdrop-blur-xl shadow-lg shadow-black/10 border border-white/20 hover:bg-white text-[#007AFF]"
            >
                {isLocating ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                    <Navigation className="w-5 h-5" />
                )}
            </Button>
        </motion.div>
    );
}