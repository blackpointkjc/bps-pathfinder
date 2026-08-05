import React from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function QuickActionCard({ title, description, icon: Icon, color, url }) {
  return (
    <Link to={url} className="block group">
      <motion.div
        whileHover={{ y: -6, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl h-full cursor-pointer"
      >
        {/* Gradient top accent bar */}
        <div className={`h-1 bg-gradient-to-r ${color}`} />
        
        {/* Hover glow */}
        <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
        
        <div className="relative p-4 md:p-5">
          <div className="flex items-start justify-between mb-3 md:mb-4">
            <div className={`p-2.5 md:p-3 rounded-xl bg-gradient-to-br ${color} shadow-lg`}>
              <Icon className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <ArrowRight className="w-4 h-4 md:w-5 md:h-5 text-slate-500 group-hover:text-white group-hover:translate-x-1 transition-all duration-300" />
          </div>
          <h3 className="font-bold text-white text-sm md:text-base mb-1">{title}</h3>
          <p className="text-slate-400 text-xs md:text-sm">{description}</p>
        </div>
      </motion.div>
    </Link>
  );
}